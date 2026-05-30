import { describe, it, expect } from "vitest";
import { validateComponentRows, type ComponentLookups } from "./validate-components";

const emptyLookups: ComponentLookups = {
  supplierNames: new Set(),
  locationNames: new Set(),
  groupNames: new Set(),
  existingSkus: new Set(),
};

describe("validateComponentRows", () => {
  it("passes a fully-valid row", () => {
    const rows = [{ name: "Bolt", sku: "BOLT-01", unit: "ea", cost_per_unit: "0.12", reorder_point: "10", low_stock_level: "5", supplier_name: "", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error).toBeUndefined();
  });

  it("fails when name is blank", () => {
    const rows = [{ name: "", sku: "", unit: "", cost_per_unit: "", reorder_point: "", low_stock_level: "", supplier_name: "", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error).toBe("Name is required");
  });

  it("fails when sku is duplicated within the file", () => {
    const rows = [
      { name: "A", sku: "DUP", unit: "", cost_per_unit: "", reorder_point: "", low_stock_level: "", supplier_name: "", location_name: "", group_name: "" },
      { name: "B", sku: "DUP", unit: "", cost_per_unit: "", reorder_point: "", low_stock_level: "", supplier_name: "", location_name: "", group_name: "" },
    ];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toBe("Duplicate SKU in file");
  });

  it("fails when sku already exists in the DB", () => {
    const lookups = { ...emptyLookups, existingSkus: new Set(["EXISTING"]) };
    const rows = [{ name: "A", sku: "EXISTING", unit: "", cost_per_unit: "", reorder_point: "", low_stock_level: "", supplier_name: "", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, lookups);
    expect(results[0].error).toBe("SKU already exists");
  });

  it("fails when cost_per_unit is negative", () => {
    const rows = [{ name: "A", sku: "", unit: "", cost_per_unit: "-1", reorder_point: "", low_stock_level: "", supplier_name: "", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error).toBe("cost_per_unit must be a non-negative number");
  });

  it("fails when cost_per_unit is non-numeric", () => {
    const rows = [{ name: "A", sku: "", unit: "", cost_per_unit: "abc", reorder_point: "", low_stock_level: "", supplier_name: "", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error).toBe("cost_per_unit must be a non-negative number");
  });

  it("accepts cost_per_unit of zero", () => {
    const rows = [{ name: "A", sku: "", unit: "", cost_per_unit: "0", reorder_point: "", low_stock_level: "", supplier_name: "", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error).toBeUndefined();
  });

  it("fails when reorder_point is a decimal", () => {
    const rows = [{ name: "A", sku: "", unit: "", cost_per_unit: "", reorder_point: "2.5", low_stock_level: "", supplier_name: "", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error).toBe("reorder_point must be a non-negative integer");
  });

  it("fails when supplier_name is not found (case-insensitive lookup)", () => {
    const lookups = { ...emptyLookups, supplierNames: new Set(["omron"]) };
    const rows = [{ name: "A", sku: "", unit: "", cost_per_unit: "", reorder_point: "", low_stock_level: "", supplier_name: "Unknown Supplier", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, lookups);
    expect(results[0].error).toBe("Supplier not found: Unknown Supplier");
  });

  it("passes when supplier_name matches case-insensitively", () => {
    const lookups = { ...emptyLookups, supplierNames: new Set(["omron"]) };
    const rows = [{ name: "A", sku: "", unit: "", cost_per_unit: "", reorder_point: "", low_stock_level: "", supplier_name: "OMRON", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, lookups);
    expect(results[0].error).toBeUndefined();
  });

  it("assigns rowIndex starting at 2 (header is row 1)", () => {
    const rows = [{ name: "A", sku: "", unit: "", cost_per_unit: "", reorder_point: "", low_stock_level: "", supplier_name: "", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].rowIndex).toBe(2);
  });

  it("returns first error per row (name check runs before sku check)", () => {
    const lookups = { ...emptyLookups, existingSkus: new Set(["X"]) };
    const rows = [{ name: "", sku: "X", unit: "", cost_per_unit: "", reorder_point: "", low_stock_level: "", supplier_name: "", location_name: "", group_name: "" }];
    const results = validateComponentRows(rows, lookups);
    expect(results[0].error).toBe("Name is required");
  });
});
