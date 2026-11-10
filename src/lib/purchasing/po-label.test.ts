import { describe, expect, it } from "vitest";
import { poLabel } from "./po-label";

const id = "abcdef12-3456-7890-abcd-ef1234567890";

describe("poLabel", () => {
  it("returns the number when present", () => {
    expect(poLabel({ id, po_number: "PO-0042" })).toBe("PO-0042");
    expect(poLabel({ id, po_number: "  PO-0042 " })).toBe("PO-0042");
  });
  it("falls back for blank or whitespace numbers", () => {
    expect(poLabel({ id, po_number: "" })).toBe("PO-ABCDEF12");
    expect(poLabel({ id, po_number: "   " })).toBe("PO-ABCDEF12");
  });
  it("falls back for missing numbers", () => {
    expect(poLabel({ id, po_number: null })).toBe("PO-ABCDEF12");
    expect(poLabel({ id, po_number: undefined })).toBe("PO-ABCDEF12");
  });
});
