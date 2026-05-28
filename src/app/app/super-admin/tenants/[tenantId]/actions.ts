"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";

export async function suspendTenant(input: { tenantId: string; reason: string }): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase
    .from("tenant")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: input.reason })
    .eq("id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "suspend_tenant",
    targetTenantId: input.tenantId,
    metadata: { reason: input.reason },
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
  revalidatePath("/app/super-admin");
}

export async function unsuspendTenant(input: { tenantId: string; reason?: string }): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase
    .from("tenant")
    .update({ suspended_at: null, suspended_reason: null })
    .eq("id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "unsuspend_tenant",
    targetTenantId: input.tenantId,
    metadata: input.reason ? { reason: input.reason } : {},
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
  revalidatePath("/app/super-admin");
}

export async function softDeleteTenant(input: { tenantId: string; reason: string }): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase
    .from("tenant")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "soft_delete_tenant",
    targetTenantId: input.tenantId,
    metadata: { reason: input.reason },
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
  revalidatePath("/app/super-admin");
}

export async function restoreTenant(input: { tenantId: string; reason?: string }): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase
    .from("tenant")
    .update({ deleted_at: null })
    .eq("id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "restore_tenant",
    targetTenantId: input.tenantId,
    metadata: input.reason ? { reason: input.reason } : {},
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
  revalidatePath("/app/super-admin");
}

export async function extendTrial(input: {
  tenantId: string;
  newTrialEndsAt: string;
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  if (new Date(input.newTrialEndsAt).getTime() <= Date.now()) {
    throw new Error("newTrialEndsAt must be in the future");
  }
  const { error } = await supabase
    .from("tenant_subscription")
    .update({ trial_ends_at: input.newTrialEndsAt })
    .eq("tenant_id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "extend_trial",
    targetTenantId: input.tenantId,
    metadata: { reason: input.reason, newTrialEndsAt: input.newTrialEndsAt },
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
}

export async function changePlan(input: {
  tenantId: string;
  selected_tier?: "starter" | "growth" | "pro" | "enterprise";
  status?: "trialing" | "active" | "past_due" | "canceled";
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  if (!input.selected_tier && !input.status) {
    throw new Error("At least one of selected_tier or status is required");
  }
  const patch: Record<string, unknown> = { manual_override_at: new Date().toISOString() };
  if (input.selected_tier) patch.selected_tier = input.selected_tier;
  if (input.status) patch.status = input.status;
  const { error } = await supabase
    .from("tenant_subscription")
    .update(patch)
    .eq("tenant_id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "change_plan",
    targetTenantId: input.tenantId,
    metadata: {
      reason: input.reason,
      selected_tier: input.selected_tier,
      status: input.status,
    },
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
}
