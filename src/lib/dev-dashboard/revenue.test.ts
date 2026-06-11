import { describe, expect, it } from "vitest";
import { calculateRevenueMetrics } from "./revenue";

describe("calculateRevenueMetrics", () => {
  it("excludes trialing subscriptions from MRR and ARPU", () => {
    const result = calculateRevenueMetrics([
      {
        tenant_id: "paid-1",
        selected_tier: "growth",
        status: "active",
        billing_interval: "monthly",
      },
      {
        tenant_id: "paid-2",
        selected_tier: "starter",
        status: "active",
        billing_interval: "monthly",
      },
      {
        tenant_id: "trial-1",
        selected_tier: "pro",
        status: "trialing",
        billing_interval: "monthly",
      },
    ]);

    expect(result.mrr).toBe(418);
    expect(result.arpu).toBe(209);
    expect(result.revenueByTier).toEqual([
      { tier: "growth", count: 1, mrr: 299 },
      { tier: "starter", count: 1, mrr: 119 },
    ]);
  });

  it("returns zero ARPU when there are no paid subscriptions", () => {
    const result = calculateRevenueMetrics([
      {
        tenant_id: "trial-1",
        selected_tier: "pro",
        status: "trialing",
        billing_interval: "monthly",
      },
    ]);

    expect(result.mrr).toBe(0);
    expect(result.arpu).toBe(0);
    expect(result.revenueByTier).toEqual([]);
  });
});
