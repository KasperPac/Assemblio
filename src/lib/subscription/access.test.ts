import { describe, expect, it } from "vitest";
import { getSubscriptionAccess } from "./access";

function mockSupabase(subRow: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: subRow, error: null }),
        }),
      }),
    }),
  } as never;
}

const tenantId = "t-1";

describe("getSubscriptionAccess", () => {
  it("returns 'paywall' if no subscription row", async () => {
    const result = await getSubscriptionAccess(mockSupabase(null), tenantId);
    expect(result.state).toBe("paywall");
    expect(result.sub).toBeNull();
  });

  it("returns 'ok' for active subscription", async () => {
    const result = await getSubscriptionAccess(
      mockSupabase({
        status: "active",
        selected_tier: "growth",
        trial_started_at: "2026-04-01T00:00:00Z",
        trial_ends_at: "2026-04-15T00:00:00Z",
        updated_at: "2026-04-15T00:00:00Z",
        created_at: "2026-04-01T00:00:00Z",
        current_period_end: "2026-06-01T00:00:00Z",
      }),
      tenantId,
      new Date("2026-05-10T00:00:00Z")
    );
    expect(result.state).toBe("ok");
  });

  it("returns 'ok' with daysLeft for active trial", async () => {
    const result = await getSubscriptionAccess(
      mockSupabase({
        status: "trialing",
        selected_tier: "growth",
        trial_started_at: "2026-05-01T00:00:00Z",
        trial_ends_at: "2026-05-15T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
        created_at: "2026-05-01T00:00:00Z",
        current_period_end: null,
      }),
      tenantId,
      new Date("2026-05-10T00:00:00Z")
    );
    expect(result.state).toBe("ok");
    expect(result.daysLeft).toBe(5);
  });

  it("returns 'paywall' for expired trial", async () => {
    const result = await getSubscriptionAccess(
      mockSupabase({
        status: "trialing",
        selected_tier: "growth",
        trial_started_at: "2026-04-25T00:00:00Z",
        trial_ends_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-04-25T00:00:00Z",
        created_at: "2026-04-25T00:00:00Z",
        current_period_end: null,
      }),
      tenantId,
      new Date("2026-05-10T00:00:00Z")
    );
    expect(result.state).toBe("paywall");
  });

  it("returns 'ok' for past_due within 3 days (soft warn)", async () => {
    const result = await getSubscriptionAccess(
      mockSupabase({
        status: "past_due",
        selected_tier: "growth",
        trial_started_at: "2026-03-01T00:00:00Z",
        trial_ends_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        created_at: "2026-03-01T00:00:00Z",
        current_period_end: "2026-05-09T00:00:00Z",
      }),
      tenantId,
      new Date("2026-05-10T00:00:00Z")
    );
    expect(result.state).toBe("ok");
  });

  it("returns 'past_due_locked' after 3 days past_due", async () => {
    const result = await getSubscriptionAccess(
      mockSupabase({
        status: "past_due",
        selected_tier: "growth",
        trial_started_at: "2026-03-01T00:00:00Z",
        trial_ends_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-05-05T00:00:00Z",
        created_at: "2026-03-01T00:00:00Z",
        current_period_end: "2026-05-05T00:00:00Z",
      }),
      tenantId,
      new Date("2026-05-10T00:00:00Z")
    );
    expect(result.state).toBe("past_due_locked");
  });

  it("returns 'paywall' for canceled", async () => {
    const result = await getSubscriptionAccess(
      mockSupabase({
        status: "canceled",
        selected_tier: "growth",
        trial_started_at: "2026-03-01T00:00:00Z",
        trial_ends_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
        created_at: "2026-03-01T00:00:00Z",
        current_period_end: null,
      }),
      tenantId,
      new Date("2026-05-10T00:00:00Z")
    );
    expect(result.state).toBe("paywall");
  });
});
