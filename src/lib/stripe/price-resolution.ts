import {
  PLANS,
  type BillingInterval,
  type PlanTier,
} from "../plans";

export function priceIdFor(
  tier: PlanTier,
  billing: BillingInterval
): string {
  const ids = PLANS[tier].stripePriceIds;
  if (!ids) throw new Error(`No Stripe price IDs configured for tier ${tier}`);
  const id = ids[billing];
  if (!id) {
    throw new Error(`Missing Stripe price for ${tier}/${billing}`);
  }
  return id;
}

export function resolvePriceId(
  priceId: string
): { tier: PlanTier; billing: BillingInterval } | null {
  for (const [tier, plan] of Object.entries(PLANS) as Array<
    [PlanTier, (typeof PLANS)[PlanTier]]
  >) {
    if (!plan.stripePriceIds) continue;
    if (plan.stripePriceIds.monthly === priceId) {
      return { tier, billing: "monthly" };
    }
    if (plan.stripePriceIds.annual === priceId) {
      return { tier, billing: "annual" };
    }
  }
  return null;
}
