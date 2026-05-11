"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assertWithinLimit,
  LimitExceededError,
} from "@/lib/subscription/limits";

export type AcceptResult =
  | { ok: true }
  | { ok: false; error: string };

interface PendingInvitation {
  id: string;
  tenant_id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
  accepted_at: string | null;
  token: string;
}

async function loadPendingInvitation(
  token: string
): Promise<PendingInvitation | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("tenant_invitation")
    .select(
      "id, tenant_id, email, role, expires_at, accepted_at, token"
    )
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  if (data.accepted_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as PendingInvitation;
}

async function linkProfileToTenant(args: {
  profileId: string;
  tenantId: string;
  role: "admin" | "member";
}): Promise<{ error: string | null }> {
  const admin = createSupabaseAdminClient();

  await admin
    .from("profiles")
    .upsert(
      {
        id: args.profileId,
        tenant_id: args.tenantId,
        role: args.role,
        status: "active",
      },
      { onConflict: "id" }
    );

  const { error: accessError } = await admin
    .from("profile_tenant_access")
    .upsert(
      {
        profile_id: args.profileId,
        tenant_id: args.tenantId,
        role: args.role,
      },
      { onConflict: "profile_id,tenant_id" }
    );
  if (accessError) return { error: accessError.message };

  return { error: null };
}

export async function acceptInviteExistingUser(
  token: string
): Promise<AcceptResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to accept this invitation." };

  const inv = await loadPendingInvitation(token);
  if (!inv) {
    return { ok: false, error: "This invitation is invalid or expired." };
  }
  if (user.email?.toLowerCase() !== inv.email.toLowerCase()) {
    return {
      ok: false,
      error: `This invite is for ${inv.email}. Sign in with that account first.`,
    };
  }

  const admin = createSupabaseAdminClient();
  try {
    await assertWithinLimit(admin, inv.tenant_id, "users");
  } catch (err) {
    if (err instanceof LimitExceededError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  const { error: linkError } = await linkProfileToTenant({
    profileId: user.id,
    tenantId: inv.tenant_id,
    role: inv.role,
  });
  if (linkError) return { ok: false, error: linkError };

  await admin
    .from("tenant_invitation")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", inv.id);

  redirect("/app");
}

export async function acceptInviteNewUser(
  token: string,
  formData: FormData
): Promise<AcceptResult> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName) {
    return { ok: false, error: "Please enter your name." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const inv = await loadPendingInvitation(token);
  if (!inv) {
    return { ok: false, error: "This invitation is invalid or expired." };
  }

  const admin = createSupabaseAdminClient();
  try {
    await assertWithinLimit(admin, inv.tenant_id, "users");
  } catch (err) {
    if (err instanceof LimitExceededError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
  if (createError || !created.user) {
    return {
      ok: false,
      error: createError?.message ?? "Could not create your account.",
    };
  }

  await admin.from("profiles").insert({
    id: created.user.id,
    tenant_id: inv.tenant_id,
    role: inv.role,
    full_name: fullName,
    status: "active",
  });

  const { error: accessError } = await admin
    .from("profile_tenant_access")
    .insert({
      profile_id: created.user.id,
      tenant_id: inv.tenant_id,
      role: inv.role,
    });
  if (accessError) {
    return { ok: false, error: accessError.message };
  }

  await admin
    .from("tenant_invitation")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", inv.id);

  // Sign the user in so the redirect lands on /app authenticated.
  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: inv.email,
    password,
  });
  if (signInError) {
    // The account exists — surface a helpful next-step.
    return {
      ok: false,
      error: "Account created — sign in to continue.",
    };
  }

  redirect("/app");
}
