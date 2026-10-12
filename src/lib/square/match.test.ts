import { describe, expect, it } from "vitest";
import { matchSquareVariation, stockConversionRatio, trackedSquareLocations } from "./match";

describe("Square retail matching", () => {
  const candidates = [{ id: "Pac-Technologies-retail-1", sku: "BOTTLE", barcode: "001234567890" }, { id: "Pac-Technologies-retail-2", sku: "CASE", barcode: "001234567899" }];
  it("prefers a unique SKU and preserves leading zeros in barcode fallback", () => {
    expect(matchSquareVariation({ barcode: "001234567890", sku: "CASE" }, candidates).variant_id).toBe(candidates[1].id);
    expect(matchSquareVariation({ barcode: "001234567890" }, candidates).variant_id).toBe(candidates[0].id);
    expect(matchSquareVariation({ barcode: "1234567890" }, candidates).status).toBe("unmatched");
  });
  it("keeps ambiguity visible instead of falling through to another identifier", () => {
    expect(matchSquareVariation({ barcode: "001234567899", sku: "BOTTLE" }, [...candidates, { ...candidates[0], id: "duplicate" }]).status).toBe("ambiguous");
  });
  it("keeps manual mapping and ignore decisions", () => {
    const existing = { variant_id: candidates[1].id, status: "linked" as const, match_method: "manual" as const };
    expect(matchSquareVariation({ sku: "BOTTLE" }, candidates, existing)).toBe(existing);
  });
  it("matches trimmed SKUs case-sensitively", () => {
    expect(matchSquareVariation({ sku: " BOTTLE " }, candidates).status).toBe("linked");
    expect(matchSquareVariation({ sku: "bottle" }, candidates).status).toBe("unmatched");
  });
  it("excludes salon services and respects per-location inventory overrides", () => {
    const item = { id: "item", type: "ITEM", item_data: { product_type: "REGULAR" } };
    const variation = { id: "variation", type: "ITEM_VARIATION", item_variation_data: { track_inventory: true, location_overrides: [{ location_id: "untracked", track_inventory: false }] } };
    expect(trackedSquareLocations(item, variation, ["stocked", "untracked"])).toEqual(["stocked"]);
    expect(trackedSquareLocations({ ...item, item_data: { product_type: "APPOINTMENTS_SERVICE" } }, variation, ["stocked"])).toEqual([]);
  });
  it("uses physical quantity conversions and rejects corrupt ratios", () => {
    expect(stockConversionRatio({ id: "case", type: "ITEM_VARIATION", item_variation_data: { stockable_conversion: { stockable_item_variation_id: "bottle", stockable_quantity: "6", nonstockable_quantity: "1" } } })).toBe(6);
    expect(() => stockConversionRatio({ id: "case", type: "ITEM_VARIATION", item_variation_data: { stockable_conversion: { stockable_item_variation_id: "bottle", stockable_quantity: "6", nonstockable_quantity: "0" } } })).toThrow();
  });
});
