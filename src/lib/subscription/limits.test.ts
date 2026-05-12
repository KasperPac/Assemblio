import { describe, expect, it } from "vitest";
import { LimitExceededError, assertWithinLimit, computeLimit } from "./limits";

describe("computeLimit", () => {
  it("returns starter limits", () => {
    expect(computeLimit("starter", "locations")).toBe(1);
    expect(computeLimit("starter", "users")).toBe(3);
  });

  it("returns Infinity for unlimited users on growth", () => {
    expect(computeLimit("growth", "users")).toBe(Infinity);
  });

  it("returns Infinity for both kinds on pro and enterprise", () => {
    expect(computeLimit("pro", "locations")).toBe(Infinity);
    expect(computeLimit("pro", "users")).toBe(Infinity);
    expect(computeLimit("enterprise", "locations")).toBe(Infinity);
    expect(computeLimit("enterprise", "users")).toBe(Infinity);
  });
});

describe("LimitExceededError", () => {
  it("carries kind, limit, current, tier", () => {
    const e = new LimitExceededError("locations", 1, 5, "starter");
    expect(e.kind).toBe("locations");
    expect(e.limit).toBe(1);
    expect(e.current).toBe(5);
    expect(e.tier).toBe("starter");
    expect(e.message).toContain("locations");
    expect(e.message).toContain("starter");
    expect(e.name).toBe("LimitExceededError");
  });

  it("is an instance of Error", () => {
    expect(new LimitExceededError("users", 3, 4, "starter")).toBeInstanceOf(Error);
  });
});

function mockSupabase(opts: {
  subscription?: unknown;
  locationCount?: number;
  userCount?: number;
}) {
  return {
    from: (table: string) => {
      if (table === "tenant_subscription") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.subscription ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      // For 'location' and 'profile_tenant_access', the call shape is:
      //   from(t).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)
      // and the awaited result is { count, data, error }.
      return {
        select: () => ({
          eq: async () => ({
            count:
              table === "location"
                ? (opts.locationCount ?? 0)
                : (opts.userCount ?? 0),
            data: null,
            error: null,
          }),
        }),
      };
    },
  } as never;
}

describe("assertWithinLimit", () => {
  const starterActiveRow = {
    status: "active",
    selected_tier: "starter",
    trial_started_at: "2026-01-01T00:00:00Z",
    trial_ends_at: "2026-01-15T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
    current_period_end: "2099-01-01T00:00:00Z",
  };

  it("throws LimitExceededError when starter is at the locations limit", async () => {
    const supabase = mockSupabase({
      subscription: starterActiveRow,
      locationCount: 1,
    });
    await expect(
      assertWithinLimit(supabase, "t-1", "locations")
    ).rejects.toMatchObject({
      name: "LimitExceededError",
      kind: "locations",
      limit: 1,
      current: 1,
      tier: "starter",
    });
  });

  it("resolves when starter is under the locations limit", async () => {
    const supabase = mockSupabase({
      subscription: starterActiveRow,
      locationCount: 0,
    });
    await expect(
      assertWithinLimit(supabase, "t-1", "locations")
    ).resolves.toBeUndefined();
  });

  it("resolves for trialing tenant even when at would-be starter limit (effective tier is pro)", async () => {
    const trialingRow = {
      status: "trialing",
      selected_tier: "starter",
      trial_started_at: "2026-01-01T00:00:00Z",
      trial_ends_at: "2099-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      current_period_end: null,
    };
    const supabase = mockSupabase({
      subscription: trialingRow,
      locationCount: 5,
    });
    await expect(
      assertWithinLimit(supabase, "t-1", "locations")
    ).resolves.toBeUndefined();
  });

  it("throws LimitExceededError(kind, 0, 0, 'starter') when there is no subscription row", async () => {
    const supabase = mockSupabase({ subscription: null });
    await expect(
      assertWithinLimit(supabase, "t-1", "locations")
    ).rejects.toMatchObject({
      name: "LimitExceededError",
      kind: "locations",
      limit: 0,
      current: 0,
      tier: "starter",
    });
  });
});
