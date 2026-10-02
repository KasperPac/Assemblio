import { describe, expect, it } from "vitest";
import { buildXeroBill, buildXeroContact, decideVoidAction, existingBillWhere, stockLineDescription, voidPayload, xeroBillUrl } from "./bill";

const input = {
  contactId: "c-1", invoiceNumber: "INV-9", date: "2026-10-01", dueDate: "2026-10-31",
  amountsMode: "inclusive" as const, currencyCode: "AUD",
  lines: [{ description: "BOLT-1 Bolt · PO-12", quantity: 10000, unitAmount: 0.0125, accountCode: "630", taxType: "INPUT" }],
};

describe("buildXeroBill", () => {
  it("builds a SUBMITTED ACCPAY bill with the supplier number in InvoiceNumber", () => {
    const b = buildXeroBill(input).Invoices[0];
    expect(b).toMatchObject({ Type: "ACCPAY", Contact: { ContactID: "c-1" }, InvoiceNumber: "INV-9", Date: "2026-10-01", DueDate: "2026-10-31", LineAmountTypes: "Inclusive", CurrencyCode: "AUD", Status: "SUBMITTED" });
    expect(b).not.toHaveProperty("Reference");
  });
  it("never sends ItemCode and keeps 4dp unit amounts", () => {
    const line = buildXeroBill(input).Invoices[0].LineItems[0];
    expect(line).toEqual({ Description: "BOLT-1 Bolt · PO-12", Quantity: 10000, UnitAmount: 0.0125, AccountCode: "630", TaxType: "INPUT" });
    expect(line).not.toHaveProperty("ItemCode");
  });
  it("refuses an empty bill", () => {
    expect(() => buildXeroBill({ ...input, lines: [] })).toThrow(/at least one line/);
  });
});

describe("helpers", () => {
  it("describes stock lines", () => {
    expect(stockLineDescription({ sku: "BOLT-1", name: "Bolt", poNumber: "PO-12", receiptRef: "DN 55" })).toBe("BOLT-1 Bolt · PO-12 · receipt DN 55");
    expect(stockLineDescription({ sku: null, name: "Bolt", poNumber: null, receiptRef: null })).toBe("Bolt");
  });
  it("links to the bill", () => {
    expect(xeroBillUrl("abc")).toBe("https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=abc");
  });
  it("escapes quotes in the duplicate search", () => {
    expect(existingBillWhere("c-1", 'A"B')).toBe('Type=="ACCPAY" AND Contact.ContactID==guid("c-1") AND InvoiceNumber=="A\\"B"');
  });
  it.each([
    [{ InvoiceID: "i", Status: "DRAFT" }, "delete"],
    [{ InvoiceID: "i", Status: "SUBMITTED" }, "delete"],
    [{ InvoiceID: "i", Status: "AUTHORISED", AmountPaid: 0 }, "void"],
    [{ InvoiceID: "i", Status: "VOIDED" }, "already"],
    [{ InvoiceID: "i", Status: "DELETED" }, "already"],
    [{ InvoiceID: "i", Status: "AUTHORISED", AmountPaid: 5 }, "blocked"],
    [{ InvoiceID: "i", Status: "PAID" }, "blocked"],
  ])("void decision for %j is %s", (bill, kind) => {
    expect(decideVoidAction(bill).kind).toBe(kind);
  });
  it("builds void and contact payloads", () => {
    expect(voidPayload("i", "void")).toEqual({ Invoices: [{ InvoiceID: "i", Status: "VOIDED" }] });
    expect(voidPayload("i", "delete")).toEqual({ Invoices: [{ InvoiceID: "i", Status: "DELETED" }] });
    expect(buildXeroContact({ name: " Acme ", email: "a@acme.test", phone: null, address: "1 Main St" })).toEqual({
      Contacts: [{ Name: "Acme", EmailAddress: "a@acme.test", Addresses: [{ AddressType: "STREET", AddressLine1: "1 Main St" }] }],
    });
  });
});
