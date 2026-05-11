"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { PLANS, type PlanTier, type BillingInterval } from "../../lib/plans";

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

export async function signUpTenant(
  _prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const companyName = formData.get("company_name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const planRaw = formData.get("plan")?.toString();
  const billingRaw = formData.get("billing")?.toString();

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
    const tenantId = tenantRow.id as string;

    const now = new Date();
    const trialEnds = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Step 3: child rows in parallel.
    const results = await Promise.all([
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
      admin.from("activity_log").insert({
        tenant_id: tenantId,
        event: "tenant.created",
        metadata: { plan, billing },
      }),
    ]);

    for (const r of results) {
      if (r.error) throw r.error;
    }
  } catch (err) {
    // Rollback: delete the orphaned auth user.
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
