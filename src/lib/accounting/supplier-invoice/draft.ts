import type { AmountsMode } from "./calc";

export type DraftLine = {
  kind: "stock" | "other";
  deliveryReceiptLineId: string | null;
  componentId: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
  taxType: string | null;
  taxRatePercent: number;
  accountCode: string | null;
};

export type DraftPayload = {
  id: string | null;
  supplierId: string;
  purchaseOrderId: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amountsMode: AmountsMode;
  enteredTotal: number | null;
  currency: string;
  lines: DraftLine[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === "string" && ISO_DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const optUuid = (v: unknown) => v === null || (typeof v === "string" && UUID.test(v));

export function parseDraftPayload(raw: unknown): { ok: true; value: DraftPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invoice data is missing." };
  const r = raw as Record<string, unknown>;
  if (!optUuid(r.id)) return { ok: false, error: "Invalid invoice id." };
  if (typeof r.supplierId !== "string" || !UUID.test(r.supplierId)) return { ok: false, error: "Choose a supplier." };
  if (!optUuid(r.purchaseOrderId)) return { ok: false, error: "Invalid purchase order." };
  const invoiceNumber = typeof r.invoiceNumber === "string" ? r.invoiceNumber.trim() : "";
  if (!invoiceNumber) return { ok: false, error: "Enter the supplier's invoice number." };
  if (invoiceNumber.length > 255) return { ok: false, error: "The invoice number is too long." };
  if (!isDate(r.invoiceDate)) return { ok: false, error: "Enter a valid invoice date." };
  if (!isDate(r.dueDate)) return { ok: false, error: "Enter a valid due date." };
  if (r.dueDate < r.invoiceDate) return { ok: false, error: "The due date can't be before the invoice date." };
  if (r.amountsMode !== "inclusive" && r.amountsMode !== "exclusive") return { ok: false, error: "Choose whether amounts include GST." };
  if (r.enteredTotal !== null && !isNum(r.enteredTotal)) return { ok: false, error: "The printed total must be a number." };
  if (typeof r.currency !== "string" || !/^[A-Z]{3}$/.test(r.currency)) return { ok: false, error: "Invalid currency." };
  if (!Array.isArray(r.lines) || r.lines.length === 0) return { ok: false, error: "Add at least one line." };

  const lines: DraftLine[] = [];
  const seen = new Set<string>();
  for (const [i, l] of (r.lines as Record<string, unknown>[]).entries()) {
    const n = i + 1;
    if (l.kind !== "stock" && l.kind !== "other") return { ok: false, error: `Line ${n}: unknown line type.` };
    if (!optUuid(l.deliveryReceiptLineId) || !optUuid(l.componentId)) return { ok: false, error: `Line ${n}: invalid reference.` };
    if (l.kind === "stock" && !l.deliveryReceiptLineId) return { ok: false, error: `Line ${n}: stock lines must come from a receipt.` };
    if (l.kind === "other" && l.deliveryReceiptLineId) return { ok: false, error: `Line ${n}: other charges can't reference a receipt.` };
    if (typeof l.deliveryReceiptLineId === "string") {
      if (seen.has(l.deliveryReceiptLineId)) return { ok: false, error: `Line ${n}: that receipt line is already on this invoice.` };
      seen.add(l.deliveryReceiptLineId);
    }
    const description = typeof l.description === "string" ? l.description.trim() : "";
    if (!description) return { ok: false, error: `Line ${n}: add a description.` };
    if (!isNum(l.quantity) || l.quantity <= 0) return { ok: false, error: `Line ${n}: quantity must be more than 0.` };
    if (!isNum(l.unitAmount) || l.unitAmount < 0) return { ok: false, error: `Line ${n}: price can't be negative.` };
    if (!isNum(l.taxRatePercent) || l.taxRatePercent < 0 || l.taxRatePercent > 100) return { ok: false, error: `Line ${n}: invalid tax rate.` };
    if (l.taxType !== null && typeof l.taxType !== "string") return { ok: false, error: `Line ${n}: invalid tax type.` };
    if (l.accountCode !== null && typeof l.accountCode !== "string") return { ok: false, error: `Line ${n}: invalid account.` };
    lines.push({
      kind: l.kind,
      deliveryReceiptLineId: (l.deliveryReceiptLineId as string | null) ?? null,
      componentId: (l.componentId as string | null) ?? null,
      description: description.slice(0, 4000),
      quantity: l.quantity,
      unitAmount: l.unitAmount,
      taxType: (l.taxType as string | null) ?? null,
      taxRatePercent: l.taxRatePercent,
      accountCode: (l.accountCode as string | null) ?? null,
    });
  }
  return {
    ok: true,
    value: {
      id: (r.id as string | null) ?? null,
      supplierId: r.supplierId,
      purchaseOrderId: (r.purchaseOrderId as string | null) ?? null,
      invoiceNumber,
      invoiceDate: r.invoiceDate,
      dueDate: r.dueDate,
      amountsMode: r.amountsMode,
      enteredTotal: (r.enteredTotal as number | null) ?? null,
      currency: r.currency,
      lines,
    },
  };
}
