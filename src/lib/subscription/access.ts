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

export class MalformedSubscriptionRow extends Error {
  constructor(public readonly field: string) {
    super(`tenant_subscription row missing or invalid: ${field}`);
    this.name = "MalformedSubscriptionRow";
  }
}

function parseRequiredDate(
  value: unknown,
  field: string
): Date {
  const date = new Date(value as string);
  if (isNaN(date.getTime())) {
    throw new MalformedSubscriptionRow(field);
  }
  return date;
}

function rowToSub(row: Record<string, unknown>): TenantSubscriptionRow {
  const trial_started_at = parseRequiredDate(row.trial_started_at, "trial_started_at");
  const trial_ends_at = parseRequiredDate(row.trial_ends_at, "trial_ends_at");
  const created_at = parseRequiredDate(row.created_at, "created_at");
  const updated_at = parseRequiredDate(row.updated_at, "updated_at");

  let current_period_end: Date | null = null;
  if (row.current_period_end) {
    const cpe = new Date(row.current_period_end as string);
    if (isNaN(cpe.getTime())) {
      throw new MalformedSubscriptionRow("current_period_end");
    }
    current_period_end = cpe;
  }

  return {
    ...(row as object),
    trial_started_at,
    trial_ends_at,
    current_period_end,
    created_at,
    updated_at,
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

  let sub: TenantSubscriptionRow;
  try {
    sub = rowToSub(data);
  } catch (err) {
    if (err instanceof MalformedSubscriptionRow) {
      console.error(
        `[subscription/access] malformed tenant_subscription row for tenant ${tenantId}: ${err.message}`
      );
      return { state: "paywall", sub: null };
    }
    throw err;
  }

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
