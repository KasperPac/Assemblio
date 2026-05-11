import type { SupabaseClient } from "@supabase/supabase-js";
import { PLANS, effectiveTier, type PlanTier } from "../plans";
import { getSubscriptionAccess } from "./access";

export type LimitKind = "locations" | "users";

export class LimitExceededError extends Error {
  constructor(
    public readonly kind: LimitKind,
    public readonly limit: number,
    public readonly current: number,
    public readonly tier: PlanTier
  ) {
    super(
      `Plan limit exceeded: ${kind} (current ${current}, allowed ${limit} on ${tier})`
    );
    this.name = "LimitExceededError";
  }
}

export function computeLimit(tier: PlanTier, kind: LimitKind): number {
  return PLANS[tier].limits[kind];
}

export interface UsageCounts {
  locations: number;
  users: number;
}

export async function countTenantUsage(
  supabase: SupabaseClient,
  tenantId: string
): Promise<UsageCounts> {
  const [{ count: locations }, { count: users }] = await Promise.all([
    supabase
      .from("location")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("profile_tenant_access")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);

  return { locations: locations ?? 0, users: users ?? 0 };
}

export async function assertWithinLimit(
  supabase: SupabaseClient,
  tenantId: string,
  kind: LimitKind
): Promise<void> {
  const access = await getSubscriptionAccess(supabase, tenantId);
  if (!access.sub) {
    throw new LimitExceededError(kind, 0, 0, "starter");
  }
  const tier = effectiveTier(access.sub);
  const limit = computeLimit(tier, kind);
  if (limit === Infinity) return;

  const usage = await countTenantUsage(supabase, tenantId);
  if (usage[kind] >= limit) {
    throw new LimitExceededError(kind, limit, usage[kind], tier);
  }
}
