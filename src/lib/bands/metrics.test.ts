import { describe, expect, it } from "vitest";
import {
  countBelowReorderComponents, countOpenProductionJobs, deliveryComparisonBounds,
  isAwaitingReceipt, onTimeDeliveryComparison, resolveBandTimezone, tenantDateKey,
  tenantDayBounds, type DeliveryMetricRow,
} from "./metrics";

describe("band metrics", () => {
  it("counts a flagged component once across bins, using the table's zero default for missing thresholds", () => {
    expect(countBelowReorderComponents([
      { componentId: "pac-bolt", onHand: 2, reorderPoint: 3 },
      { componentId: "pac-bolt", onHand: 0, reorderPoint: 3 },
      { componentId: "pac-nut", onHand: 3, reorderPoint: 3 },
      { componentId: "pac-washer", onHand: -1, reorderPoint: null },
      { componentId: null, onHand: 0, reorderPoint: 3 },
      { componentId: "pac-pin", onHand: -1, reorderPoint: 0 },
    ])).toBe(3);
  });

  it("counts open order lines rather than routing operations", () => {
    expect(countOpenProductionJobs([
      { order_line_id: "pac-line-1", status: "active" },
      { order_line_id: "pac-line-1", status: "queued" },
      { order_line_id: "pac-line-2", status: "blocked" },
      { order_line_id: "pac-line-3", status: "complete" },
      { order_line_id: "pac-line-4", status: "skipped" },
    ])).toBe(2);
    expect(countOpenProductionJobs([])).toBe(0);
  });

  it("includes only receivable canonical PO states", () => {
    expect(["open", "in_transit", "received", "cancelled", "archived", "unknown"].filter(isAwaitingReceipt))
      .toEqual(["open", "in_transit"]);
  });

  it("uses the actual tenant calendar date, with Sydney fallback only for absent/invalid zones", () => {
    const instant = "2026-10-04T13:30:00Z";
    expect(tenantDateKey(instant, "Australia/Sydney")).toBe("2026-10-05");
    expect(tenantDateKey(instant, "Australia/Brisbane")).toBe("2026-10-04");
    expect(resolveBandTimezone("Pacific/Auckland")).toBe("Pacific/Auckland");
    expect(resolveBandTimezone("bad-zone")).toBe("Australia/Sydney");
    expect(resolveBandTimezone(null)).toBe("Australia/Sydney");
  });

  it("returns 23h and 25h Sydney calendar days at DST boundaries", () => {
    const spring = tenantDayBounds(new Date("2026-10-04T02:00:00Z"), "Australia/Sydney");
    expect(spring).toEqual({ start: "2026-10-03T14:00:00.000Z", end: "2026-10-04T13:00:00.000Z" });
    const autumn = tenantDayBounds(new Date("2026-04-05T02:00:00Z"), "Australia/Sydney");
    expect(autumn).toEqual({ start: "2026-04-04T13:00:00.000Z", end: "2026-04-05T14:00:00.000Z" });
    const brisbane = tenantDayBounds(new Date("2026-10-04T02:00:00Z"), "Australia/Brisbane");
    expect(Date.parse(brisbane.end) - Date.parse(brisbane.start)).toBe(24 * 60 * 60 * 1000);
  });
});

describe("on-time delivery comparison", () => {
  const now = new Date("2026-10-12T01:00:00Z");
  const receipt = (received_at: string, expected_date: string | null, status = "po_linked"): DeliveryMetricRow => ({
    received_at, status, purchase_order: { expected_date },
  });

  it("excludes unscheduled, unprocessed, invalid and future receipts from the denominator", () => {
    const result = onTimeDeliveryComparison([
      receipt("2026-10-10T10:00:00Z", "2026-10-10T00:00:00Z"), // later same local day still on time
      receipt("2026-10-11T10:00:00Z", "2026-10-10T00:00:00Z", "discrepancy"),
      receipt("2026-10-10T10:00:00Z", null),
      receipt("2026-10-10T10:00:00Z", "2026-10-10T00:00:00Z", "unmatched"),
      receipt("bad-date", "2026-10-10T00:00:00Z"),
      receipt("2026-10-13T10:00:00Z", "2026-10-13T00:00:00Z"),
      { received_at: "2026-10-10T10:00:00Z", status: "po_linked", purchase_order: null },
    ], now, "Australia/Sydney");
    expect(result).toEqual({ currentPercent: 50, previousPercent: null, eligibleReceipts: 2, deltaPoints: null });
  });

  it("compares distinct nonoverlapping 90-day windows and handles joined relation arrays", () => {
    const bounds = deliveryComparisonBounds(now);
    expect(Date.parse(bounds.end) - Date.parse(bounds.currentStart)).toBe(90 * 24 * 60 * 60 * 1000);
    expect(Date.parse(bounds.currentStart) - Date.parse(bounds.previousStart)).toBe(90 * 24 * 60 * 60 * 1000);
    const previousReceipt = receipt(bounds.previousStart, bounds.previousStart);
    previousReceipt.purchase_order = [{ expected_date: bounds.previousStart }];
    const result = onTimeDeliveryComparison([
      receipt(bounds.currentStart, bounds.currentStart),
      receipt("2026-10-11T10:00:00Z", "2026-10-10T00:00:00Z"),
      previousReceipt,
      receipt(new Date(Date.parse(bounds.previousStart) - 1).toISOString(), bounds.previousStart),
    ], now, "Australia/Sydney");
    expect(result).toEqual({ currentPercent: 50, previousPercent: 100, eligibleReceipts: 2, deltaPoints: -50 });
  });

  it("uses tenant dates for deadline crossings and leaves empty history unavailable", () => {
    const rows = [receipt("2026-10-04T13:30:00Z", "2026-10-04T00:00:00Z")];
    expect(onTimeDeliveryComparison(rows, now, "Australia/Sydney").currentPercent).toBe(0);
    expect(onTimeDeliveryComparison(rows, now, "Australia/Brisbane").currentPercent).toBe(100);
    expect(onTimeDeliveryComparison([], now, "Australia/Sydney"))
      .toEqual({ currentPercent: null, previousPercent: null, eligibleReceipts: 0, deltaPoints: null });
  });
});
