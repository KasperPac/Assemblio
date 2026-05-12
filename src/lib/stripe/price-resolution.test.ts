import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PLANS reads `process.env.STRIPE_PRICE_*` at import time, so each test stubs
// the env vars then dynamic-imports the module after `vi.resetModules()` so
// PLANS picks up the stubs.

const STARTER_M = "price_starter_monthly_test";
const STARTER_A = "price_starter_annual_test";
const GROWTH_M = "price_growth_monthly_test";
const GROWTH_A = "price_growth_annual_test";
const PRO_M = "price_pro_monthly_test";
const PRO_A = "price_pro_annual_test";

async function loadModule() {
  vi.resetModules();
  return await import("./price-resolution");
}

describe("price-resolution", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_STARTER_MONTHLY", STARTER_M);
    vi.stubEnv("STRIPE_PRICE_STARTER_ANNUAL", STARTER_A);
    vi.stubEnv("STRIPE_PRICE_GROWTH_MONTHLY", GROWTH_M);
    vi.stubEnv("STRIPE_PRICE_GROWTH_ANNUAL", GROWTH_A);
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", PRO_M);
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", PRO_A);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("priceIdFor", () => {
    it("maps starter monthly", async () => {
      const { priceIdFor } = await loadModule();
      expect(priceIdFor("starter", "monthly")).toBe(STARTER_M);
    });

    it("maps growth annual", async () => {
      const { priceIdFor } = await loadModule();
      expect(priceIdFor("growth", "annual")).toBe(GROWTH_A);
    });

    it("maps pro monthly and annual", async () => {
      const { priceIdFor } = await loadModule();
      expect(priceIdFor("pro", "monthly")).toBe(PRO_M);
      expect(priceIdFor("pro", "annual")).toBe(PRO_A);
    });

    it("throws for enterprise (no Stripe price configured)", async () => {
      const { priceIdFor } = await loadModule();
      expect(() => priceIdFor("enterprise", "monthly")).toThrow(
        /No Stripe price IDs/
      );
    });

    it("throws when env var is missing for the requested tier", async () => {
      vi.stubEnv("STRIPE_PRICE_GROWTH_MONTHLY", "");
      const { priceIdFor } = await loadModule();
      expect(() => priceIdFor("growth", "monthly")).toThrow(
        /Missing Stripe price/
      );
    });
  });

  describe("resolvePriceId", () => {
    it("reverse-maps a known price ID", async () => {
      const { resolvePriceId } = await loadModule();
      expect(resolvePriceId(PRO_A)).toEqual({ tier: "pro", billing: "annual" });
      expect(resolvePriceId(STARTER_M)).toEqual({
        tier: "starter",
        billing: "monthly",
      });
    });

    it("returns null for an unknown price ID", async () => {
      const { resolvePriceId } = await loadModule();
      expect(resolvePriceId("price_not_a_real_id")).toBeNull();
    });

    it("returns null for the empty string", async () => {
      const { resolvePriceId } = await loadModule();
      expect(resolvePriceId("")).toBeNull();
    });
  });
});
