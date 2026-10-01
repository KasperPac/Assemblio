export type AmountsMode = "inclusive" | "exclusive";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** Used when the tenant has no Xero connection: tax types stay null. */
export const FALLBACK_TAX_OPTIONS = [
  { taxType: null, name: "GST 10%", rate: 10 },
  { taxType: null, name: "GST-free", rate: 0 },
] as const;

export function lineAmounts(line: { quantity: number; unitAmount: number; taxRatePercent: number }, mode: AmountsMode) {
  const lineAmount = round2(line.quantity * line.unitAmount);
  const r = line.taxRatePercent / 100;
  const taxAmount = mode === "inclusive" ? round2(lineAmount - lineAmount / (1 + r)) : round2(lineAmount * r);
  const exTaxUnitAmount = mode === "inclusive" ? round4(line.unitAmount / (1 + r)) : round4(line.unitAmount);
  return { lineAmount, taxAmount, exTaxUnitAmount };
}

/** Must match the SQL in post_supplier_invoice (Task 11). */
export function invoiceTotals(lines: { lineAmount: number; taxAmount: number }[], mode: AmountsMode) {
  const amt = round2(lines.reduce((s, l) => s + l.lineAmount, 0));
  const tax = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  return mode === "inclusive"
    ? { subtotal: round2(amt - tax), taxTotal: tax, total: amt }
    : { subtotal: amt, taxTotal: tax, total: round2(amt + tax) };
}

export function lineVariance(input: { quantity: number; exTaxUnitAmount: number; receivedQty: number; poUnitCost: number | null }) {
  return {
    qtyVariance: round4(input.quantity - input.receivedQty),
    priceVariance: input.poUnitCost === null ? null : round4(input.exTaxUnitAmount - input.poUnitCost),
  };
}

export const TOTAL_TOLERANCE = 0.05;

export function totalMismatch(computedTotal: number, enteredTotal: number | null): boolean {
  return enteredTotal !== null && Math.abs(round2(computedTotal - enteredTotal)) > TOTAL_TOLERANCE;
}

export function isInvoiceableReceipt(r: { stock_in_reason: string | null; supplier_id: string | null }, supplierId: string): boolean {
  return r.stock_in_reason === "supplier_delivery" && r.supplier_id === supplierId;
}
