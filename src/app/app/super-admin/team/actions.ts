"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";

async function assertNotLastSuperAdmin(supabase: SupabaseClient, profileId: string): Promise<string | null> {
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single();

  const currentRole: string | null = (target as { role: string } | null)?.role ?? null;
  if (currentRole !== "super_admin") return currentRole; // not a super_admin, no risk

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin");

  if (count !== null && count <= 1) {
    throw new Error("cannot remove last super_admin");
  }
  return currentRole;
}

export async function addPlatformUser(input: {
  email: string;
  role: "super_admin" | "platform_observer";
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();

  const { data: foundId, error } = await supabase.rpc("get_profile_by_email", {
    p_email: input.email.trim().toLowerCase(),
  });

  if (error || !foundId) {
    throw new Error(`No account found for "${input.email}". Ask them to sign up first, then add them here.`);
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ role: input.role, super_admin_home_tenant_id: null })
    .eq("id", foundId);

  if (updateError) throw new Error(updateError.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "add_platform_user",
    targetUserId: foundId,
    metadata: { email: input.email, role: input.role, reason: input.reason },
  });

  revalidatePath("/app/super-admin/team");
}

export async function changePlatformUserRole(input: {
  profileId: string;
  newRole: "super_admin" | "platform_observer";
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();

  const oldRole = await assertNotLastSuperAdmin(supabase, input.profileId);

  const { error } = await supabase
    .from("profiles")
    .update({ role: input.newRole })
    .eq("id", input.profileId);

  if (error) throw new Error(error.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "change_platform_user_role",
    targetUserId: input.profileId,
    metadata: { oldRole, newRole: input.newRole, reason: input.reason },
  });

  revalidatePath("/app/super-admin/team");
}

export async function removePlatformUser(input: {
  profileId: string;
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();

  // Fetch target to check role and tenant_id
  const { data: target } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", input.profileId)
    .single();

  if (!target) {
    throw new Error("Profile not found.");
  }
  if (!target.tenant_id) {
    throw new Error(
      "set a tenant first — this user has no home tenant. Assign one via SQL before removing their platform role."
    );
  }

  await assertNotLastSuperAdmin(supabase, input.profileId);

  const { error } = await supabase
    .from("profiles")
    .update({ role: "member", super_admin_home_tenant_id: null })
    .eq("id", input.profileId);

  if (error) throw new Error(error.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "remove_platform_user",
    targetUserId: input.profileId,
    metadata: { oldRole: target.role, reason: input.reason },
  });

  revalidatePath("/app/super-admin/team");
}
