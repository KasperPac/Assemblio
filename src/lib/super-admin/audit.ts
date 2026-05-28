import type { SupabaseClient } from "@supabase/supabase-js";

export type SuperAdminAction =
  | "create_tenant"
  | "suspend_tenant"
  | "unsuspend_tenant"
  | "extend_trial"
  | "change_plan"
  | "soft_delete_tenant"
  | "restore_tenant"
  | "view_as"
  | "exit_view_as"
  | "exit_view_as_no_home"
  | "add_member"
  | "remove_member"
  | "change_role"
  | "add_platform_user"
  | "change_platform_user_role"
  | "remove_platform_user"
  | "privacy_model_tightened";

export interface AuditEntry {
  actorId: string;
  action: SuperAdminAction;
  targetTenantId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logSuperAdminAction(
  supabase: SupabaseClient,
  entry: AuditEntry
): Promise<void> {
  const { error } = await supabase.from("super_admin_audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_tenant_id: entry.targetTenantId ?? null,
    target_user_id: entry.targetUserId ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) {
    console.warn("[super-admin] audit log insert failed", entry.action, error);
  }
}
