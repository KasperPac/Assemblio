"use server";

import { trialEndDate } from "@/lib/plans";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { PLANS, type PlanTier, type BillingInterval } from "../../lib/plans";
import { buildActivityRow } from "@/lib/activity/build";

export type SignUpState = { error?: string; message?: string };

const VALID_PLANS: PlanTier[] = ["starter", "growth", "pro"];
const VALID_INTERVALS: BillingInterval[] = ["monthly", "annual"];

function parsePlan(raw: string | null | undefined): PlanTier {
  if (raw && (VALID_PLANS as string[]).includes(raw)) return raw as PlanTier;
  return "growth";
}

function parseInterval(raw: string | null | undefined): BillingInterval {
  if (raw && (VALID_INTERVALS as string[]).includes(raw)) return raw as BillingInterval;
  return "annual";
}

/**
 * Self-serve signup that creates a tenant + TRIAL_DAYS-day trial atomically (best-effort).
 *
 * Operational requirement: the linked Supabase Auth project MUST have email
 * confirmation DISABLED. The trial spec ("clock starts at signup") depends on
 * `supabase.auth.signUp` returning a populated `data.user` so we can attach
 * a tenant immediately. If confirmation is on, `data.user` is null and the
 * user is left without a tenant — they would sign in later and hit the
 * no-tenant fallback in getServerTenantContext.
 *
 * If confirmation must be on (compliance, abuse mitigation), persist
 * companyName/plan/billing into auth.users.user_metadata at signUp time and
 * provision the tenant via a post-confirmation trigger or first-sign-in
 * bootstrap. Out of scope for v1.
 */
export async function signUpTenant(
  _prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const companyName = formData.get("company_name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const planRaw = formData.get("plan")?.toString();
  const billingRaw = formData.get("billing")?.toString();
  const token = formData.get("token")?.toString().trim() ?? "";

  if (!token) return { error: "Signup is invite-only during beta." };
  if (!companyName) return { error: "Company name is required." };
  if (!email) return { error: "Email is required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  if (planRaw === "enterprise") {
    return { error: "Contact sales for Enterprise." };
  }
  const plan = parsePlan(planRaw);
  const billing = parseInterval(billingRaw);
  // sanity check tier exists in PLANS
  if (!PLANS[plan]) return { error: "Invalid plan." };

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  // Step 0: validate the beta token. We re-check here in case the URL was
  // tampered with between page-render validation and form submission.
  const { data: betaRow, error: betaError } = await admin
    .from("beta_applications")
    .select("id, email, status")
    .eq("signup_token", token)
    .maybeSingle();
  if (betaError) {
    return { error: "Couldn't validate your invite. Please try again." };
  }
  if (!betaRow || betaRow.status !== "approved") {
    return {
      error:
        "This invite is no longer valid. Apply again at /apply and we'll sort it out.",
    };
  }
  const betaApplicationId = betaRow.id as string;

  // Step 1: create the auth user.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (signUpError) return { error: signUpError.message };
  const authUser = signUpData.user;
  if (!authUser) {
    return {
      message: "Check your email to confirm your account, then sign in to continue.",
    };
  }

  let tenantId: string | null = null;

  try {
    // Step 2: insert tenant row.
    const { data: tenantRow, error: tenantError } = await admin
      .from("tenant")
      .insert({ name: companyName })
      .select("id")
      .single();
    if (tenantError || !tenantRow) {
      throw tenantError ?? new Error("tenant insert failed");
    }
    tenantId = tenantRow.id as string;

    const now = new Date();
    const trialEnds = trialEndDate(now);

    // Step 3: child rows in parallel.
    // allSettled so we wait for every in-flight insert before rolling back —
    // prevents an insert from landing after the catch deletes the tenant.
    const results = await Promise.allSettled([
      admin.from("profiles").insert({
        id: authUser.id,
        tenant_id: tenantId,
        role: "admin",
      }),
      admin.from("profile_tenant_access").insert({
        profile_id: authUser.id,
        tenant_id: tenantId,
        role: "admin",
      }),
      admin.from("tenant_subscription").insert({
        tenant_id: tenantId,
        selected_tier: plan,
        status: "trialing",
        billing_interval: billing,
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnds.toISOString(),
      }),
      admin.from("activity_log").insert(buildActivityRow({ event: "tenant.created", tenantId, actorId: authUser.id, actorType: "user", actorLabel: null, metadata: { plan, billing } })),
    ]);

    for (const r of results) {
      if (r.status === "rejected") {
        throw r.reason;
      }
      if (r.value.error) {
        throw r.value.error;
      }
    }

    // Step 4: mark the beta application consumed. Best-effort — failure here
    // doesn't roll back the tenant; we'd rather have a duplicate-redeem risk
    // (extremely low at beta volume) than orphan a fresh tenant.
    await admin
      .from("beta_applications")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", betaApplicationId);
  } catch (err) {
    // Rollback in three best-effort steps. Each is wrapped so one failure
    // doesn't stop the others.
    if (tenantId !== null) {
      try {
        // All four child tables (profiles, profile_tenant_access,
        // tenant_subscription, activity_log) cascade on tenant_id, so
        // deleting the tenant cleans them up.
        // See supabase/patches/tenant_child_cascades.sql.
        await admin.from("tenant").delete().eq("id", tenantId);
      } catch (tenantDeleteErr) {
        console.error(
          "signup.orphan_tenant",
          { tenantId, originalError: String(err) },
          tenantDeleteErr
        );
      }
    }

    try {
      await admin.auth.admin.deleteUser(authUser.id);
    } catch (deleteErr) {
      console.error(
        "signup.orphan_auth_user",
        { userId: authUser.id, originalError: String(err) },
        deleteErr
      );
    }

    return { error: err instanceof Error ? err.message : "Signup failed." };
  }

  redirect("/app");
}
