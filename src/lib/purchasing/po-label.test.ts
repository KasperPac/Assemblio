import { describe, expect, it } from "vitest";
import { poLabel } from "./po-label";

describe("poLabel", () => {
  const id = "abcd1234-0000-4000-8000-000000000000";
  it("uses the PO number when there is one", () => {
    expect(poLabel({ id, po_number: " PO-77 " })).toBe("PO-77");
  });
  it("falls back to the short id when the number is null, empty or blank", () => {
    expect(poLabel({ id, po_number: null })).toBe("PO-ABCD1234");
    expect(poLabel({ id, po_number: "" })).toBe("PO-ABCD1234");
    expect(poLabel({ id, po_number: "   " })).toBe("PO-ABCD1234");
  });
});
