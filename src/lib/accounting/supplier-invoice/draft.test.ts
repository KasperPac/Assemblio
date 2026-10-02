import { describe, expect, it } from "vitest";
import { parseDraftPayload } from "./draft";

const base = {
  id: null, supplierId: "11111111-1111-1111-1111-111111111111", purchaseOrderId: null,
  invoiceNumber: " INV-1 ", invoiceDate: "2026-10-01", dueDate: "2026-10-31",
  amountsMode: "exclusive", enteredTotal: 110, currency: "AUD",
  lines: [{ kind: "stock", deliveryReceiptLineId: "22222222-2222-2222-2222-222222222222", componentId: null, description: "Bolt", quantity: 10, unitAmount: 10, taxType: "INPUT", taxRatePercent: 10, accountCode: "630" }],
};

describe("parseDraftPayload", () => {
  it("accepts a valid draft and trims the invoice number", () => {
    const r = parseDraftPayload(base);
    expect(r.ok && r.value.invoiceNumber).toBe("INV-1");
  });
  it.each([
    [{ invoiceNumber: "  " }, /invoice number/i],
    [{ invoiceDate: "01/10/2026" }, /invoice date/i],
    [{ dueDate: "2026-09-30" }, /due date/i],
    [{ amountsMode: "gross" }, /amounts/i],
    [{ lines: [] }, /at least one line/i],
    [{ supplierId: "nope" }, /supplier/i],
  ])("rejects %j", (patch, re) => {
    const r = parseDraftPayload({ ...base, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
  it("rejects a stock line without a receipt line and a non-positive quantity", () => {
    expect(parseDraftPayload({ ...base, lines: [{ ...base.lines[0], deliveryReceiptLineId: null }] }).ok).toBe(false);
    expect(parseDraftPayload({ ...base, lines: [{ ...base.lines[0], quantity: 0 }] }).ok).toBe(false);
  });
  it("rejects the same receipt line twice", () => {
    expect(parseDraftPayload({ ...base, lines: [base.lines[0], base.lines[0]] }).ok).toBe(false);
  });
  it("does not throw on invalid line objects; returns error instead", () => {
    expect(parseDraftPayload({ ...base, lines: [null] }).ok).toBe(false);
    expect(parseDraftPayload({ ...base, lines: [1] }).ok).toBe(false);
    expect(parseDraftPayload({ ...base, lines: ["x"] }).ok).toBe(false);
  });
  it("rejects impossible dates like 2026-02-31", () => {
    const r = parseDraftPayload({ ...base, invoiceDate: "2026-02-31" });
    expect(r.ok).toBe(false);
  });
  it("accepts valid leap year date 2028-02-29", () => {
    const r = parseDraftPayload({ ...base, invoiceDate: "2028-02-29", dueDate: "2028-03-31" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.invoiceDate).toBe("2028-02-29");
  });
});
