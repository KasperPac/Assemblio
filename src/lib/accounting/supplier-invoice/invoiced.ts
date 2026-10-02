import { one } from "./util";

type InvoiceLineRow = { delivery_receipt_line_id: string; supplier_invoice: unknown };

/**
 * True when there is at least one receipt line and every one is on a live (non-voided, draft or posted)
 * supplier invoice, so there is nothing left to invoice.
 */
export function allLinesInvoiced(receiptLineIds: readonly string[], invoiceLines: readonly InvoiceLineRow[]): boolean {
  if (receiptLineIds.length === 0) return false;
  const taken = new Set(
    invoiceLines
      .filter((r) => {
        const si = one(r.supplier_invoice as { status: string } | Array<{ status: string }> | null);
        return !!si && si.status !== "voided";
      })
      .map((r) => r.delivery_receipt_line_id),
  );
  return receiptLineIds.every((id) => taken.has(id));
}
