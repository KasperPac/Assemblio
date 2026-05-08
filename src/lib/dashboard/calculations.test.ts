import { describe, it, expect } from "vitest";
import { calcDaysRemaining, calcTurnoverRatio } from "./calculations";

describe("calcDaysRemaining", () => {
  it("returns days when burn rate is positive", () => {
    expect(calcDaysRemaining(100, 20, 4)).toBe(20); // (100-20)/4 = 20
  });

  it("floors to integer", () => {
    expect(calcDaysRemaining(100, 20, 6)).toBe(13); // 80/6 = 13.3 → 13
  });

  it("returns null when avgDailyBurn is zero", () => {
    expect(calcDaysRemaining(100, 0, 0)).toBeNull();
  });

  it("returns null when avgDailyBurn is negative", () => {
    expect(calcDaysRemaining(100, 0, -1)).toBeNull();
  });

  it("returns 0 when available is zero or negative", () => {
    expect(calcDaysRemaining(0, 0, 5)).toBe(0);
    expect(calcDaysRemaining(5, 10, 5)).toBe(0);
  });
});

describe("calcTurnoverRatio", () => {
  it("returns ratio rounded to 1 decimal place", () => {
    expect(calcTurnoverRatio(120_000, 20_000, 40_000)).toBe(4.0); // 120k/30k avg
  });

  it("returns null when avg inventory value is zero", () => {
    expect(calcTurnoverRatio(50_000, 0, 0)).toBeNull();
  });

  it("returns 0.0 when cogs is zero", () => {
    expect(calcTurnoverRatio(0, 10_000, 20_000)).toBe(0.0);
  });
});
