import { describe, expect, it } from "vitest";
import { resolveOrderDate, isHistoricalOrder } from "./order-dates";

describe("resolveOrderDate", () => {
  it("prefers processedAt over createdAt", () => {
    expect(resolveOrderDate("2024-01-01T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(
      "2024-01-01T00:00:00Z"
    );
  });
  it("falls back to createdAt when processedAt is null", () => {
    expect(resolveOrderDate(null, "2026-01-01T00:00:00Z")).toBe("2026-01-01T00:00:00Z");
  });
  it("returns null when both are null", () => {
    expect(resolveOrderDate(null, null)).toBeNull();
  });
});

describe("isHistoricalOrder", () => {
  it("is false when no cutoff is set", () => {
    expect(isHistoricalOrder("2024-01-01T00:00:00Z", null)).toBe(false);
  });
  it("is true when order date is before the cutoff", () => {
    expect(isHistoricalOrder("2024-06-01T00:00:00Z", "2025-01-01")).toBe(true);
  });
  it("is false when order date is on/after the cutoff", () => {
    expect(isHistoricalOrder("2025-01-01T12:00:00Z", "2025-01-01")).toBe(false);
  });
  it("is false when order date is unknown (null)", () => {
    expect(isHistoricalOrder(null, "2025-01-01")).toBe(false);
  });
});
