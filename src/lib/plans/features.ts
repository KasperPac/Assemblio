import {
  effectiveTier,
  PLANS,
  type PlanFeatures,
  type TenantSubscriptionRow,
} from "./index";

export type FeatureKey = keyof PlanFeatures;

/**
 * Returns true when the tenant's effective tier (which respects active
 * trials) has the requested feature flag enabled.
 *
 * Callers should already have a non-null subscription — a missing
 * subscription row means the tenant is paywalled and should be redirected
 * upstream by the app-shell gate rather than checked here.
 */
export function hasFeature(
  sub: Pick<TenantSubscriptionRow, "status" | "selected_tier" | "trial_ends_at">,
  feature: FeatureKey
): boolean {
  return PLANS[effectiveTier(sub)].features[feature];
}
