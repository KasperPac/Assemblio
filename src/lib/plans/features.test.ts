import { describe, expect, it } from "vitest";
import { hasFeature } from "./features";
import type { TenantSubscriptionRow } from "./index";

function sub(
  overrides: Partial<TenantSubscriptionRow>
): TenantSubscriptionRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    tenant_id: "00000000-0000-0000-0000-000000000001",
    selected_tier: "starter",
    status: "active",
    billing_interval: "monthly",
    trial_started_at: new Date("2026-05-01T00:00:00Z"),
    trial_ends_at: new Date("2026-05-15T00:00:00Z"),
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_end: null,
    created_at: new Date("2026-05-01T00:00:00Z"),
    updated_at: new Date("2026-05-01T00:00:00Z"),
    ...overrides,
  };
}

describe("hasFeature", () => {
  it("active starter cannot use binManagement", () => {
    expect(hasFeature(sub({ status: "active", selected_tier: "starter" }), "binManagement")).toBe(false);
  });

  it("active growth, pro, enterprise have binManagement", () => {
    expect(hasFeature(sub({ status: "active", selected_tier: "growth" }), "binManagement")).toBe(true);
    expect(hasFeature(sub({ status: "active", selected_tier: "pro" }), "binManagement")).toBe(true);
    expect(hasFeature(sub({ status: "active", selected_tier: "enterprise" }), "binManagement")).toBe(true);
  });

  it("trialing starter has Pro features (trial uses effective tier)", () => {
    const trialing = sub({
      status: "trialing",
      selected_tier: "starter",
      trial_ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    expect(hasFeature(trialing, "binManagement")).toBe(true);
    expect(hasFeature(trialing, "apiAccess")).toBe(true);
    expect(hasFeature(trialing, "financialProfitability")).toBe(true);
  });

  it("expired-trial starter loses Pro features (effective tier drops back)", () => {
    const expired = sub({
      status: "trialing",
      selected_tier: "starter",
      trial_ends_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    expect(hasFeature(expired, "binManagement")).toBe(false);
    expect(hasFeature(expired, "apiAccess")).toBe(false);
  });

  it("active starter cannot use advancedBom", () => {
    expect(hasFeature(sub({ status: "active", selected_tier: "starter" }), "advancedBom")).toBe(false);
  });

  it("active growth can use advancedBom but not capacityPlanning", () => {
    const growth = sub({ status: "active", selected_tier: "growth" });
    expect(hasFeature(growth, "advancedBom")).toBe(true);
    expect(hasFeature(growth, "capacityPlanning")).toBe(false);
  });

  it("active pro covers everything except enterprise-only flags (none today)", () => {
    const pro = sub({ status: "active", selected_tier: "pro" });
    expect(hasFeature(pro, "advancedBom")).toBe(true);
    expect(hasFeature(pro, "capacityPlanning")).toBe(true);
    expect(hasFeature(pro, "apiAccess")).toBe(true);
    expect(hasFeature(pro, "multipleShopifyStores")).toBe(true);
  });

  it("past_due preserves the paid tier features (handled by gate, not feature)", () => {
    const pd = sub({ status: "past_due", selected_tier: "pro" });
    expect(hasFeature(pd, "apiAccess")).toBe(true);
  });
});
