import { describe, expect, it } from "vitest";
import { allLinesInvoiced } from "./invoiced";

const row = (lineId: string, status: string | null) => ({ delivery_receipt_line_id: lineId, supplier_invoice: status === null ? null : { status } });

describe("allLinesInvoiced", () => {
  it("is true when every line is on a non-voided invoice, draft or posted", () => {
    expect(allLinesInvoiced(["a", "b"], [row("a", "posted"), row("b", "draft")])).toBe(true);
  });
  it("is false when a line is uninvoiced or only on a voided invoice", () => {
    expect(allLinesInvoiced(["a", "b"], [row("a", "posted")])).toBe(false);
    expect(allLinesInvoiced(["a", "b"], [row("a", "posted"), row("b", "voided")])).toBe(false);
    expect(allLinesInvoiced(["a"], [row("a", null)])).toBe(false);
  });
  it("counts a line voided on one invoice but live on another", () => {
    expect(allLinesInvoiced(["a"], [row("a", "voided"), row("a", "posted")])).toBe(true);
  });
  it("is false when there are no lines at all", () => {
    expect(allLinesInvoiced([], [])).toBe(false);
  });
  it("accepts an embedded relation returned as a one-element array", () => {
    expect(allLinesInvoiced(["a"], [{ delivery_receipt_line_id: "a", supplier_invoice: [{ status: "posted" }] }])).toBe(true);
  });
});
