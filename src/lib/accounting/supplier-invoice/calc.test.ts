import { describe, expect, it } from "vitest";
import { invoiceTotals, isInvoiceableReceipt, lineAmounts, lineVariance, round2, round4, totalMismatch } from "./calc";

describe("rounding", () => {
  it("handles 0.1 + 0.2 === 0.3", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it("rounds 1.005 to 1.01 (half away from zero)", () => {
    expect(round2(1.005)).toBe(1.01);
  });
  it("rounds 10.005 to 10.01", () => {
    expect(round2(10.005)).toBe(10.01);
  });
  it("rounds 1234.565 to 1234.57", () => {
    expect(round2(1234.565)).toBe(1234.57);
  });
  it("rounds -1.005 to -1.01", () => {
    expect(round2(-1.005)).toBe(-1.01);
  });
  it("round4: 1.00005 to 1.0001", () => {
    expect(round4(1.00005)).toBe(1.0001);
  });
  it("rounds tiny magnitudes to 0: 5e-7", () => {
    expect(round2(5e-7)).toBe(0);
  });
  it("rounds tiny magnitudes to 0: 9.99e-7 at 4dp", () => {
    expect(round4(9.99e-7)).toBe(0);
  });
  it("rounds negative tiny magnitudes to 0: -5e-7", () => {
    expect(round2(-5e-7)).toBe(0);
  });
  it("returns positive 0, not -0, for small negatives", () => {
    expect(Object.is(round2(-0.004), 0)).toBe(true);
  });
});

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
  it("exclusive: 40.15 at 10% tax should be 4.02 (half-away rounding)", () => {
    expect(lineAmounts({ quantity: 1, unitAmount: 40.15, taxRatePercent: 10 }, "exclusive")).toEqual({ lineAmount: 40.15, taxAmount: 4.02, exTaxUnitAmount: 40.15 });
  });
  it("inclusive: 110.00 at 10% should give tax 10.00", () => {
    expect(lineAmounts({ quantity: 1, unitAmount: 110, taxRatePercent: 10 }, "inclusive")).toEqual({ lineAmount: 110, taxAmount: 10, exTaxUnitAmount: 100 });
  });
});

describe("invoiceTotals", () => {
  it("exclusive", () => {
    expect(invoiceTotals([{ lineAmount: 100, taxAmount: 10 }, { lineAmount: 20, taxAmount: 2 }], "exclusive")).toEqual({ subtotal: 120, taxTotal: 12, total: 132 });
  });
  it("inclusive", () => {
    expect(invoiceTotals([{ lineAmount: 110, taxAmount: 10 }], "inclusive")).toEqual({ subtotal: 100, taxTotal: 10, total: 110 });
  });
  it("handles binary float noise: 0.1 + 0.2 + 0.3 = 0.6", () => {
    expect(invoiceTotals([{ lineAmount: 0.1, taxAmount: 0 }, { lineAmount: 0.2, taxAmount: 0 }, { lineAmount: 0.3, taxAmount: 0 }], "exclusive")).toEqual({ subtotal: 0.6, taxTotal: 0, total: 0.6 });
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
