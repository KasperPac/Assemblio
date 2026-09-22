import { describe, expect, it } from "vitest";
import {
  PLANS,
  effectiveTier,
  paywallRequired,
  pastDueSoftLocked,
  TRIAL_DAYS,
  trialEndDate,
  type TenantSubscriptionRow,
} from "./index";

function sub(overrides: Partial<TenantSubscriptionRow>): TenantSubscriptionRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    tenant_id: "00000000-0000-0000-0000-000000000001",
    selected_tier: "growth",
    status: "trialing",
    billing_interval: null,
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

describe("PLANS", () => {
  it("has all four tiers", () => {
    expect(Object.keys(PLANS).sort()).toEqual(
      ["enterprise", "growth", "pro", "starter"]
    );
  });

  it("starter has limits {locations:1, users:3}", () => {
    expect(PLANS.starter.limits).toEqual({ locations: 1, users: 3 });
  });

  it("growth has 5 locations and unlimited users", () => {
    expect(PLANS.growth.limits.locations).toBe(5);
    expect(PLANS.growth.limits.users).toBe(Infinity);
  });

  it("pro and enterprise are unlimited", () => {
    expect(PLANS.pro.limits).toEqual({ locations: Infinity, users: Infinity });
    expect(PLANS.enterprise.limits).toEqual({ locations: Infinity, users: Infinity });
  });

  it("enterprise has null stripePriceIds (sales-led)", () => {
    expect(PLANS.enterprise.stripePriceIds).toBeNull();
  });
});

describe("effectiveTier", () => {
  const now = new Date("2026-05-10T00:00:00Z");

  it("returns 'pro' for active trial regardless of selected_tier", () => {
    expect(effectiveTier(sub({ selected_tier: "starter" }), now)).toBe("pro");
  });

  it("returns selected_tier for expired trial", () => {
    expect(
      effectiveTier(
        sub({ selected_tier: "starter", trial_ends_at: new Date("2026-05-09T00:00:00Z") }),
        now
      )
    ).toBe("starter");
  });

  it("returns selected_tier for active subscription", () => {
    expect(effectiveTier(sub({ status: "active", selected_tier: "growth" }), now)).toBe("growth");
  });

  it("returns selected_tier for past_due", () => {
    expect(effectiveTier(sub({ status: "past_due", selected_tier: "pro" }), now)).toBe("pro");
  });
});

describe("paywallRequired", () => {
  const now = new Date("2026-05-20T00:00:00Z");

  it("true for expired trialing", () => {
    expect(paywallRequired(sub({ trial_ends_at: new Date("2026-05-15T00:00:00Z") }), now)).toBe(true);
  });

  it("false for active trial", () => {
    expect(paywallRequired(sub({ trial_ends_at: new Date("2026-05-25T00:00:00Z") }), now)).toBe(false);
  });

  it("false for active status", () => {
    expect(paywallRequired(sub({ status: "active" }), now)).toBe(false);
  });

  it("true for canceled status", () => {
    expect(paywallRequired(sub({ status: "canceled" }), now)).toBe(true);
  });

  it("false for past_due status (handled by pastDueSoftLocked)", () => {
    expect(paywallRequired(sub({ status: "past_due" }), now)).toBe(false);
  });
});

describe("pastDueSoftLocked", () => {
  const now = new Date("2026-05-20T00:00:00Z");

  it("true when past_due and updated_at within 3 days", () => {
    expect(
      pastDueSoftLocked(sub({ status: "past_due", updated_at: new Date("2026-05-19T00:00:00Z") }), now)
    ).toBe(true);
  });

  it("false when past_due and updated_at older than 3 days", () => {
    expect(
      pastDueSoftLocked(sub({ status: "past_due", updated_at: new Date("2026-05-15T00:00:00Z") }), now)
    ).toBe(false);
  });

  it("false for non-past_due status", () => {
    expect(pastDueSoftLocked(sub({ status: "active" }), now)).toBe(false);
  });
});

describe("trial length", () => {
  it("is 30 days for every new workspace", () => {
    expect(TRIAL_DAYS).toBe(30);
  });

  it("trialEndDate is exactly TRIAL_DAYS after the start", () => {
    const start = new Date("2026-09-22T00:00:00Z");
    expect(trialEndDate(start).toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });
});
