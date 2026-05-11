import type { SupabaseClient } from "@supabase/supabase-js";
import {
  paywallRequired,
  pastDueSoftLocked,
  type TenantSubscriptionRow,
} from "../plans";

export type AccessState = "ok" | "paywall" | "past_due_locked";

export interface AccessResult {
  state: AccessState;
  sub: TenantSubscriptionRow | null;
  daysLeft?: number;
}

function rowToSub(row: Record<string, unknown>): TenantSubscriptionRow {
  return {
    ...(row as object),
    trial_started_at: new Date(row.trial_started_at as string),
    trial_ends_at: new Date(row.trial_ends_at as string),
    current_period_end: row.current_period_end
      ? new Date(row.current_period_end as string)
      : null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  } as TenantSubscriptionRow;
}

export async function getSubscriptionAccess(
  supabase: SupabaseClient,
  tenantId: string,
  now: Date = new Date()
): Promise<AccessResult> {
  const { data, error } = await supabase
    .from("tenant_subscription")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { state: "paywall", sub: null };

  const sub = rowToSub(data);

  if (paywallRequired(sub, now)) return { state: "paywall", sub };

  if (sub.status === "past_due") {
    if (pastDueSoftLocked(sub, now)) {
      return { state: "ok", sub };
    }
    return { state: "past_due_locked", sub };
  }

  if (sub.status === "trialing") {
    const daysLeft = Math.max(
      0,
      Math.ceil((sub.trial_ends_at.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    );
    return { state: "ok", sub, daysLeft };
  }

  return { state: "ok", sub };
}
