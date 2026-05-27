// src/lib/orders/target-ship.test.ts
import { describe, expect, it } from "vitest";
import { computeTargetShipDate, isOverdue } from "./target-ship";

describe("computeTargetShipDate", () => {
  it("adds lead-time days to created_at", () => {
    const createdAt = new Date("2026-05-27T10:00:00Z");
    expect(computeTargetShipDate(createdAt, 7)?.toISOString()).toBe(
      "2026-06-03T10:00:00.000Z"
    );
  });

  it("returns null when leadTimeDays is null", () => {
    expect(computeTargetShipDate(new Date("2026-05-27T10:00:00Z"), null)).toBeNull();
  });

  it("returns null when createdAt is null", () => {
    expect(computeTargetShipDate(null, 7)).toBeNull();
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-05-27T10:00:00Z");

  it("returns false when target is null", () => {
    expect(isOverdue(null, "not-shipped", now)).toBe(false);
  });

  it("returns false when target is in the future", () => {
    expect(isOverdue(new Date("2026-06-03T10:00:00Z"), "not-shipped", now)).toBe(false);
  });

  it("returns true when target is past and not shipped", () => {
    expect(isOverdue(new Date("2026-05-20T10:00:00Z"), "not-shipped", now)).toBe(true);
  });

  it("returns false when target is past but already shipped", () => {
    expect(isOverdue(new Date("2026-05-20T10:00:00Z"), "shipped", now)).toBe(false);
  });

  it("returns true when partially shipped and past target", () => {
    expect(isOverdue(new Date("2026-05-20T10:00:00Z"), "partially-shipped", now)).toBe(true);
  });
});
