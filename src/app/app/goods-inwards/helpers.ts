// ─── Pure helpers (no server dependencies — safe to unit-test) ───────────────

export type ReceiptStatus = "unmatched" | "po_linked" | "discrepancy";

export function computeReceiptStatus(
  purchaseOrderId: string | null,
  lines: Array<{ quantity_delivered: number; quantity_expected: number | null }>
): ReceiptStatus {
  if (!purchaseOrderId) return "unmatched";
  const hasDiscrepancy = lines.some(
    (l) =>
      l.quantity_expected !== null &&
      l.quantity_delivered !== l.quantity_expected
  );
  return hasDiscrepancy ? "discrepancy" : "po_linked";
}

export function computeVariance(
  delivered: number,
  expected: number | null
): number | null {
  if (expected === null) return null;
  return delivered - expected;
}
