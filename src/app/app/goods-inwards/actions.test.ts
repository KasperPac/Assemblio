import { describe, expect, it } from "vitest";
import { computeReceiptStatus, computeVariance } from "./helpers";

describe("computeReceiptStatus", () => {
  it("returns unmatched when no PO linked", () => {
    expect(computeReceiptStatus(null, [])).toBe("unmatched");
  });

  it("returns po_linked when all lines match expected", () => {
    const lines = [
      { quantity_delivered: 10, quantity_expected: 10 },
      { quantity_delivered: 5, quantity_expected: 5 },
    ];
    expect(computeReceiptStatus("po-id", lines)).toBe("po_linked");
  });

  it("returns discrepancy when any line is short", () => {
    expect(
      computeReceiptStatus("po-id", [
        { quantity_delivered: 8, quantity_expected: 10 },
      ])
    ).toBe("discrepancy");
  });

  it("returns discrepancy when any line is over", () => {
    expect(
      computeReceiptStatus("po-id", [
        { quantity_delivered: 12, quantity_expected: 10 },
      ])
    ).toBe("discrepancy");
  });

  it("returns po_linked when expected is null (unlinked line)", () => {
    expect(
      computeReceiptStatus("po-id", [
        { quantity_delivered: 5, quantity_expected: null },
      ])
    ).toBe("po_linked");
  });
});

describe("computeVariance", () => {
  it("returns null when expected is null", () => {
    expect(computeVariance(10, null)).toBeNull();
  });

  it("returns 0 for exact match", () => {
    expect(computeVariance(10, 10)).toBe(0);
  });

  it("returns negative for short delivery", () => {
    expect(computeVariance(8, 10)).toBe(-2);
  });

  it("returns positive for over-delivery", () => {
    expect(computeVariance(12, 10)).toBe(2);
  });
});
