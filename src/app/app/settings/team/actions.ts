"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

type State = { error?: string; success?: string } | null;

function requireAdmin(role: string): State | null {
  if (role !== "admin" && role !== "super_admin") {
    return { error: "Admin access required" };
  }
  return null;
}

export async function inviteMember(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Valid email address required" };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_tenant_id: ctx.tenantId, invited_role: "member" },
  });

  if (error) return { error: error.message };

  revalidatePath("/app/settings/team");
  return { success: `Invitation sent to ${email}` };
}

export async function updateMemberRole(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const profileId = formData.get("profile_id") as string;
  const role = formData.get("role") as string;

  if (!["member", "admin"].includes(role)) {
    return { error: "Invalid role" };
  }

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ role })
    .eq("id", profileId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/app/settings/team");
  return { success: "Role updated" };
}

export async function deactivateMember(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const profileId = formData.get("profile_id") as string;

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (user?.id === profileId) {
    return { error: "You cannot deactivate yourself" };
  }

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ status: "deactivated" })
    .eq("id", profileId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/app/settings/team");
  return { success: "Member deactivated" };
}
