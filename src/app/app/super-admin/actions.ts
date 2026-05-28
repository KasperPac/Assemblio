"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";

export interface CreateTenantInput {
  name: string;
  timezone: string;
  currency: string;
  tier: "starter" | "growth" | "pro" | "enterprise";
  trialDays: number;
  reason?: string;
}

export async function createTenant(input: CreateTenantInput): Promise<string> {
  const ctx = await requireSuperAdmin();
  const { supabase, userId } = ctx;

  const { data: tenantRow, error: tenantError } = await supabase
    .from("tenant")
    .insert({
      name: input.name,
      timezone: input.timezone,
      currency: input.currency,
      has_planning_module: false,
    })
    .select("id")
    .single();
  if (tenantError || !tenantRow) {
    throw new Error(tenantError?.message ?? "failed to insert tenant");
  }

  const trialEndsAt = new Date(Date.now() + input.trialDays * 86_400_000).toISOString();
  const { error: subError } = await supabase.from("tenant_subscription").insert({
    tenant_id: tenantRow.id,
    selected_tier: input.tier,
    status: "trialing",
    billing_interval: "annual",
    trial_started_at: new Date().toISOString(),
    trial_ends_at: trialEndsAt,
  });
  if (subError) throw new Error(subError.message);

  const { error: ptaError } = await supabase.from("profile_tenant_access").insert({
    profile_id: userId,
    tenant_id: tenantRow.id,
    role: "admin",
  });
  if (ptaError) throw new Error(ptaError.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "create_tenant",
    targetTenantId: tenantRow.id,
    metadata: {
      reason: input.reason,
      name: input.name,
      tier: input.tier,
      trialDays: input.trialDays,
    },
  });

  revalidatePath("/app/super-admin");
  return tenantRow.id;
}

export async function viewAsTenant(tenantId: string): Promise<void> {
  const ctx = await requireSuperAdmin();
  const { supabase, userId } = ctx;

  const { error } = await supabase.rpc("set_active_tenant", { p_tenant_id: tenantId });
  if (error) throw new Error(error.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "view_as",
    targetTenantId: tenantId,
  });

  revalidatePath("/app");
  redirect("/app");
}

export async function exitViewAs(): Promise<void> {
  const ctx = await requireSuperAdmin();
  const { supabase, userId, superAdminHomeTenantId } = ctx;
  if (!superAdminHomeTenantId) {
    throw new Error("no super_admin_home_tenant_id set");
  }

  const { error } = await supabase.rpc("set_active_tenant", { p_tenant_id: superAdminHomeTenantId });
  if (error) throw new Error(error.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "exit_view_as",
    targetTenantId: superAdminHomeTenantId,
  });

  revalidatePath("/app");
  redirect("/app");
}
