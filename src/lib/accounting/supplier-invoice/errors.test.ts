import { describe, expect, it } from "vitest";
import { dbErrorMessage } from "./errors";

describe("dbErrorMessage", () => {
  it("explains a duplicate invoice number, naming it when the detail has it", () => {
    expect(dbErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "supplier_invoice_live_number_uq"' }, "x"))
      .toBe("This supplier already has an invoice with that number.");
    expect(dbErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "supplier_invoice_live_number_uq"' }, "x", { invoiceNumber: "INV-42" }))
      .toBe("You've already entered invoice INV-42 for this supplier.");
  });
  it("passes through the function's own messages, capitalised", () => {
    expect(dbErrorMessage({ code: "P0001", message: "link this supplier to a Xero contact, or choose to create one, before posting" }, "x"))
      .toBe("Link this supplier to a Xero contact, or choose to create one, before posting.");
    expect(dbErrorMessage({ code: "23505", message: "a receipt line on this invoice is already on another posted invoice" }, "x"))
      .toBe("A receipt line on this invoice is already on another posted invoice.");
  });
  it("explains a lock held by an in-flight Xero send", () => {
    expect(dbErrorMessage({ code: "55P03", message: "could not obtain lock on row" }, "x"))
      .toBe("This invoice is being sent to Xero right now. Try again in a minute.");
  });
  it("never shows raw RLS text", () => {
    expect(dbErrorMessage({ code: "42501", message: 'new row violates row-level security policy for table "supplier_invoice"' }, "x"))
      .toBe("You don't have access to do that.");
    expect(dbErrorMessage({ code: "42501", message: "only admins can void supplier invoices" }, "x"))
      .toBe("Only admins can void supplier invoices.");
  });
  it("hides anything else behind the fallback", () => {
    expect(dbErrorMessage({ code: "XX000", message: "internal detail" }, "Couldn't save.")).toBe("Couldn't save.");
    expect(dbErrorMessage({ code: "23505", message: "duplicate key value violates unique constraint \"other_uq\"" }, "Couldn't save.")).toBe("Couldn't save.");
    expect(dbErrorMessage(null, "Couldn't save.")).toBe("Couldn't save.");
  });
});
