import { describe, expect, it } from "vitest";
import { invoiceTotals, isInvoiceableReceipt, lineAmounts, lineVariance, totalMismatch } from "./calc";

describe("lineAmounts", () => {
  it("exclusive: tax on top", () => {
    expect(lineAmounts({ quantity: 10, unitAmount: 1.2345, taxRatePercent: 10 }, "exclusive")).toEqual({ lineAmount: 12.35, taxAmount: 1.24, exTaxUnitAmount: 1.2345 });
  });
  it("inclusive: tax inside", () => {
    expect(lineAmounts({ quantity: 1, unitAmount: 110, taxRatePercent: 10 }, "inclusive")).toEqual({ lineAmount: 110, taxAmount: 10, exTaxUnitAmount: 100 });
  });
  it("keeps sub-cent unit costs to 4dp", () => {
    expect(lineAmounts({ quantity: 10000, unitAmount: 0.0125, taxRatePercent: 0 }, "exclusive").lineAmount).toBe(125);
  });
});

describe("invoiceTotals", () => {
  it("exclusive", () => {
    expect(invoiceTotals([{ lineAmount: 100, taxAmount: 10 }, { lineAmount: 20, taxAmount: 2 }], "exclusive")).toEqual({ subtotal: 120, taxTotal: 12, total: 132 });
  });
  it("inclusive", () => {
    expect(invoiceTotals([{ lineAmount: 110, taxAmount: 10 }], "inclusive")).toEqual({ subtotal: 100, taxTotal: 10, total: 110 });
  });
});

describe("variance and checks", () => {
  it("computes qty and price variance", () => {
    expect(lineVariance({ quantity: 9, exTaxUnitAmount: 2.1, receivedQty: 10, poUnitCost: 2 })).toEqual({ qtyVariance: -1, priceVariance: 0.1 });
    expect(lineVariance({ quantity: 10, exTaxUnitAmount: 2, receivedQty: 10, poUnitCost: null }).priceVariance).toBeNull();
  });
  it("flags printed-total mismatch beyond 5c", () => {
    expect(totalMismatch(100, 100.05)).toBe(false);
    expect(totalMismatch(100, 100.06)).toBe(true);
    expect(totalMismatch(100, null)).toBe(false);
  });
  it("only supplier deliveries from the same supplier are invoiceable", () => {
    expect(isInvoiceableReceipt({ stock_in_reason: "supplier_delivery", supplier_id: "s1" }, "s1")).toBe(true);
    expect(isInvoiceableReceipt({ stock_in_reason: "sample", supplier_id: "s1" }, "s1")).toBe(false);
    expect(isInvoiceableReceipt({ stock_in_reason: "supplier_delivery", supplier_id: null }, "s1")).toBe(false);
  });
});
