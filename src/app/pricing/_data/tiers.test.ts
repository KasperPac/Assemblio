import { describe, expect, it } from "vitest";
import { TIERS, FEATURE_MODULES } from "./tiers";

describe("TIERS", () => {
  it("has exactly 4 tiers", () => {
    expect(TIERS).toHaveLength(4);
  });

  it("tier IDs are starter, growth, pro, enterprise in order", () => {
    expect(TIERS.map((t) => t.id)).toEqual(["starter", "growth", "pro", "enterprise"]);
  });

  it("annual monthly price is lower than monthly price for paid tiers", () => {
    const paid = TIERS.filter((t) => t.annualMonthly !== null);
    for (const tier of paid) {
      expect(tier.annualMonthly!).toBeLessThan(tier.monthlyMonthly!);
    }
  });

  it("annualYearly equals annualMonthly * 12 for paid tiers", () => {
    const paid = TIERS.filter((t) => t.annualMonthly !== null);
    for (const tier of paid) {
      expect(tier.annualYearly).toBe(tier.annualMonthly! * 12);
    }
  });

  it("exactly one tier is featured", () => {
    expect(TIERS.filter((t) => t.featured)).toHaveLength(1);
  });

  it("enterprise tier has null prices", () => {
    const enterprise = TIERS.find((t) => t.id === "enterprise")!;
    expect(enterprise.annualMonthly).toBeNull();
    expect(enterprise.monthlyMonthly).toBeNull();
    expect(enterprise.annualYearly).toBeNull();
  });
});

describe("FEATURE_MODULES", () => {
  it("has exactly 9 modules", () => {
    expect(FEATURE_MODULES).toHaveLength(9);
  });

  it("every feature row has all four tier keys", () => {
    for (const mod of FEATURE_MODULES) {
      for (const feature of mod.features) {
        expect(feature).toHaveProperty("starter");
        expect(feature).toHaveProperty("growth");
        expect(feature).toHaveProperty("pro");
        expect(feature).toHaveProperty("enterprise");
      }
    }
  });

  it("no enterprise feature is false when pro is true", () => {
    for (const mod of FEATURE_MODULES) {
      for (const feature of mod.features) {
        if (feature.pro === true) {
          expect(feature.enterprise).not.toBe(false);
        }
      }
    }
  });
});
