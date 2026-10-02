import type { AmountsMode } from "../supplier-invoice/calc";

export type BillLineInput = { description: string; quantity: number; unitAmount: number; accountCode: string; taxType: string };
export type BillInput = {
  contactId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  amountsMode: AmountsMode;
  currencyCode: string;
  lines: BillLineInput[];
};

/** Xero ignores Reference on ACCPAY, so the PO number travels in line descriptions (stockLineDescription). */
export function buildXeroBill(input: BillInput) {
  if (input.lines.length === 0) throw new Error("A bill needs at least one line");
  return {
    Invoices: [
      {
        Type: "ACCPAY" as const,
        Contact: { ContactID: input.contactId },
        InvoiceNumber: input.invoiceNumber,
        Date: input.date,
        DueDate: input.dueDate,
        LineAmountTypes: input.amountsMode === "inclusive" ? ("Inclusive" as const) : ("Exclusive" as const),
        CurrencyCode: input.currencyCode,
        Status: "SUBMITTED" as const,
        LineItems: input.lines.map((l) => ({
          Description: l.description.slice(0, 4000),
          Quantity: l.quantity,
          UnitAmount: l.unitAmount,
          AccountCode: l.accountCode,
          TaxType: l.taxType,
        })),
      },
    ],
  };
}

export function stockLineDescription(p: { sku: string | null; name: string; poNumber: string | null; receiptRef: string | null }): string {
  const parts = [`${p.sku ? `${p.sku} ` : ""}${p.name}`];
  if (p.poNumber) parts.push(p.poNumber);
  if (p.receiptRef) parts.push(`receipt ${p.receiptRef}`);
  return parts.join(" · ");
}

export function xeroBillUrl(invoiceId: string): string {
  return `https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`;
}

export function existingBillWhere(contactId: string, invoiceNumber: string): string {
  const esc = invoiceNumber.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `Type=="ACCPAY" AND Contact.ContactID==guid("${contactId}") AND InvoiceNumber=="${esc}"`;
}

export type XeroBillState = { InvoiceID: string; Status: string; AmountPaid?: number; AmountCredited?: number; Total?: number };
export type VoidDecision = { kind: "delete" } | { kind: "void" } | { kind: "already" } | { kind: "blocked"; message: string };

export function decideVoidAction(b: XeroBillState): VoidDecision {
  const s = b.Status.toUpperCase();
  if (s === "DELETED" || s === "VOIDED") return { kind: "already" };
  if (s === "PAID" || (b.AmountPaid ?? 0) > 0 || (b.AmountCredited ?? 0) > 0) {
    return { kind: "blocked", message: "This bill has payments or credits in Xero. Remove them in Xero first, then retry." };
  }
  if (s === "DRAFT" || s === "SUBMITTED") return { kind: "delete" };
  if (s === "AUTHORISED") return { kind: "void" };
  return { kind: "blocked", message: `The Xero bill is in status ${b.Status} and Manuva can't void it.` };
}

export function voidPayload(invoiceId: string, kind: "delete" | "void") {
  return { Invoices: [{ InvoiceID: invoiceId, Status: kind === "delete" ? "DELETED" : "VOIDED" }] };
}

export function buildXeroContact(s: { name: string; email: string | null; phone: string | null; address: string | null }) {
  return {
    Contacts: [
      {
        Name: s.name.trim().slice(0, 255),
        ...(s.email ? { EmailAddress: s.email } : {}),
        ...(s.phone ? { Phones: [{ PhoneType: "DEFAULT", PhoneNumber: s.phone }] } : {}),
        ...(s.address ? { Addresses: [{ AddressType: "STREET", AddressLine1: s.address.slice(0, 500) }] } : {}),
      },
    ],
  };
}
