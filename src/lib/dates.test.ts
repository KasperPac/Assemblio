import { describe, expect, it } from "vitest";
import { getWeekStart } from "./dates";

describe("getWeekStart", () => {
  it("returns a YYYY-MM-DD formatted string", () => {
    expect(getWeekStart()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returned date is always a Monday (getDay() === 1)", () => {
    const result = getWeekStart();
    const [y, m, d] = result.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    expect(date.getDay()).toBe(1);
  });

  it("returned date is never more than 6 days before today", () => {
    const result = getWeekStart();
    const [y, m, d] = result.split("-").map(Number);
    const monday = new Date(Date.UTC(y, m - 1, d));
    const now = new Date();
    const diffMs = now.getTime() - monday.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(0);
    expect(diffDays).toBeLessThan(7);
  });
});
