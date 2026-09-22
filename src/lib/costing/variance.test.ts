import { describe, expect, it } from "vitest";
import { costVariance, isOverBudget } from "./variance";

describe("job cost variance", () => {
  it("is positive when the job cost more than planned", () => {
    expect(costVariance(100, { actual_total_cost: 130 })).toBe(30);
  });

  it("is negative when the job came in under plan", () => {
    expect(costVariance(100, { actual_total_cost: 80 })).toBe(-20);
  });

  it("is zero when actuals land exactly on plan", () => {
    expect(costVariance(100, { actual_total_cost: 100 })).toBe(0);
  });

  it("distinguishes 'no actuals yet' from 'on plan'", () => {
    // null drives the "Awaiting actuals" label; 0 is a real result and must
    // not be shown as if the job were still unmeasured.
    expect(costVariance(100, null)).toBeNull();
    expect(costVariance(100, undefined)).toBeNull();
    expect(costVariance(100, { actual_total_cost: 100 })).toBe(0);
  });

  it("treats missing cost figures as zero rather than producing NaN", () => {
    expect(costVariance(null, { actual_total_cost: 40 })).toBe(40);
    expect(costVariance(60, { actual_total_cost: null })).toBe(-60);
    expect(costVariance(undefined, { actual_total_cost: null })).toBe(0);
  });

  it("handles string-shaped numerics from the database", () => {
    // numeric columns arrive as strings over PostgREST.
    expect(
      costVariance("100" as unknown as number, {
        actual_total_cost: "130.50" as unknown as number,
      })
    ).toBe(30.5);
  });
});

describe("over-budget flag", () => {
  it("flags only a genuine overspend", () => {
    expect(isOverBudget(30)).toBe(true);
    expect(isOverBudget(0.01)).toBe(true);
  });

  it("does not flag on-plan, under-plan, or not-yet-measured jobs", () => {
    expect(isOverBudget(0)).toBe(false);
    expect(isOverBudget(-30)).toBe(false);
    expect(isOverBudget(null)).toBe(false);
  });
});
