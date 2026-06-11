import { TIER_MONTHLY_PRICE } from "./types";

export type RevenueSubscription = {
  tenant_id: string;
  selected_tier: string | null;
  status: string | null;
  billing_interval: string | null;
};

export function calculateRevenueMetrics(subscriptions: RevenueSubscription[]) {
  let mrr = 0;
  let paidTenantCount = 0;
  const tierCounts: Record<string, { count: number; mrr: number }> = {};

  for (const sub of subscriptions) {
    if (sub.status !== "active" || !sub.selected_tier) continue;

    const interval = sub.billing_interval ?? "monthly";
    const price = TIER_MONTHLY_PRICE[sub.selected_tier]?.[interval] ?? 0;

    mrr += price;
    paidTenantCount += 1;

    if (!tierCounts[sub.selected_tier]) {
      tierCounts[sub.selected_tier] = { count: 0, mrr: 0 };
    }
    tierCounts[sub.selected_tier].count += 1;
    tierCounts[sub.selected_tier].mrr += price;
  }

  return {
    mrr,
    arpu: paidTenantCount > 0 ? Math.round(mrr / paidTenantCount) : 0,
    revenueByTier: Object.entries(tierCounts).map(([tier, value]) => ({
      tier,
      ...value,
    })),
  };
}
