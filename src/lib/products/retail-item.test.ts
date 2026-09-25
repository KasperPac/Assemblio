import { describe, expect, it } from "vitest";
import { parseRetailItemForm } from "./retail-item";

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("parseRetailItemForm", () => {
  it("parses a full form", () => {
    const r = parseRetailItemForm(form({
      name: " Argan Oil ", sku: "OIL-50", barcode: "9300000000031",
      cost_per_unit: "12.50", reorder_point: "4", supplier_id: "s1", location_id: "", variant_id: "",
    }));
    expect(r).toEqual({ ok: true, value: {
      variantId: null, name: "Argan Oil", sku: "OIL-50", barcode: "9300000000031",
      costPerUnit: 12.5, supplierId: "s1", locationId: null, reorderPoint: 4,
    }});
  });
  it("requires a name", () => {
    expect(parseRetailItemForm(form({ name: "  " }))).toEqual({ ok: false, error: "Name is required." });
  });
  it("rejects negative or non-numeric cost and reorder point", () => {
    expect(parseRetailItemForm(form({ name: "x", cost_per_unit: "-1" })).ok).toBe(false);
    expect(parseRetailItemForm(form({ name: "x", reorder_point: "abc" })).ok).toBe(false);
  });
  it("treats blank numbers as 0", () => {
    const r = parseRetailItemForm(form({ name: "x", cost_per_unit: "", reorder_point: "" }));
    expect(r.ok && r.value.costPerUnit === 0 && r.value.reorderPoint === 0).toBe(true);
  });
});
