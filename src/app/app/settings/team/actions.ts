"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  inviteTeammate,
  revokeInvitation,
  resendInvitation,
} from "@/lib/invitations/actions";
import { logActivity } from "@/lib/activity/log";

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
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = (formData.get("role") as string) === "admin" ? "admin" : "member";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Valid email address required" };
  }

  const result = await inviteTeammate({ email, role });
  if (!result.ok) return { error: result.error };

  await logActivity({ event: "team.member_invited", metadata: { email } });
  revalidatePath("/app/settings/team");
  return { success: `Invitation sent to ${email}` };
}

export async function revokeInvite(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const invitationId = formData.get("invitation_id") as string;
  if (!invitationId) return { error: "Invalid request" };

  const result = await revokeInvitation(invitationId);
  if (!result.ok) return { error: result.error };

  await logActivity({ event: "team.invite_revoked" });
  revalidatePath("/app/settings/team");
  return { success: "Invitation revoked" };
}

export async function resendInvite(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const invitationId = formData.get("invitation_id") as string;
  if (!invitationId) return { error: "Invalid request" };

  const result = await resendInvitation(invitationId);
  if (!result.ok) return { error: result.error };

  await logActivity({ event: "team.invite_resent" });
  revalidatePath("/app/settings/team");
  return { success: "Invitation resent" };
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

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!profileId || !uuidRe.test(profileId)) return { error: "Invalid request" };
  if (!["member", "admin"].includes(role)) {
    return { error: "Invalid role" };
  }

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (user?.id === profileId) {
    return { error: "You cannot change your own role" };
  }

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", profileId)
    .eq("tenant_id", ctx.tenantId)
    .select("id");

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) {
    return { error: "Member not found in this workspace" };
  }

  await logActivity({ event: "team.role_changed", metadata: { role } });
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

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ status: "deactivated" })
    .eq("id", profileId)
    .eq("tenant_id", ctx.tenantId)
    .select("id");

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) {
    return { error: "Member not found in this workspace" };
  }

  await logActivity({ event: "team.member_deactivated" });
  revalidatePath("/app/settings/team");
  return { success: "Member deactivated" };
}
