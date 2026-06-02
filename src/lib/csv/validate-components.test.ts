import { describe, it, expect } from "vitest";
import { validateComponentRows, type ComponentLookups } from "./validate-components";

const emptyLookups: ComponentLookups = {
  supplierNames: new Set(),
  locationNames: new Set(),
  groupNames: new Set(),
  existingSkus: new Set(),
};

const baseRow = {
  name: "Bolt",
  sku: "",
  unit: "",
  cost_per_unit: "",
  reorder_point: "",
  low_stock_level: "",
  supplier_name: "",
  location_name: "",
  group_name: "",
};

describe("validateComponentRows", () => {
  it("passes a fully-valid row", () => {
    const rows = [{ ...baseRow, sku: "BOLT-01", cost_per_unit: "0.12", reorder_point: "10", low_stock_level: "5" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error).toBeUndefined();
  });

  it("fails when name is blank — hard error", () => {
    const rows = [{ ...baseRow, name: "" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error?.message).toBe("Name is required");
    expect(results[0].error?.type).toBe("hard");
  });

  it("fails when sku is duplicated within the file — hard error", () => {
    const rows = [
      { ...baseRow, name: "A", sku: "DUP" },
      { ...baseRow, name: "B", sku: "DUP" },
    ];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error).toBeUndefined();
    expect(results[1].error?.message).toBe("Duplicate SKU in file");
    expect(results[1].error?.type).toBe("hard");
  });

  it("fails when sku already exists in the DB — hard error", () => {
    const lookups = { ...emptyLookups, existingSkus: new Set(["EXISTING"]) };
    const rows = [{ ...baseRow, name: "A", sku: "EXISTING" }];
    const results = validateComponentRows(rows, lookups);
    expect(results[0].error?.message).toBe("SKU already exists");
    expect(results[0].error?.type).toBe("hard");
  });

  it("fails when cost_per_unit is negative — hard error", () => {
    const rows = [{ ...baseRow, cost_per_unit: "-1" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error?.message).toBe("cost_per_unit must be a non-negative number");
    expect(results[0].error?.type).toBe("hard");
  });

  it("fails when cost_per_unit is non-numeric — hard error", () => {
    const rows = [{ ...baseRow, cost_per_unit: "abc" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error?.message).toBe("cost_per_unit must be a non-negative number");
    expect(results[0].error?.type).toBe("hard");
  });

  it("accepts cost_per_unit of zero", () => {
    const rows = [{ ...baseRow, cost_per_unit: "0" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error).toBeUndefined();
  });

  it("fails when reorder_point is a decimal — hard error", () => {
    const rows = [{ ...baseRow, reorder_point: "2.5" }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].error?.message).toBe("reorder_point must be a non-negative integer");
    expect(results[0].error?.type).toBe("hard");
  });

  it("supplier_name not found → soft error, field = supplier_name", () => {
    const lookups = { ...emptyLookups, supplierNames: new Set(["omron"]) };
    const rows = [{ ...baseRow, supplier_name: "Unknown Supplier" }];
    const results = validateComponentRows(rows, lookups);
    expect(results[0].error?.message).toBe("Supplier not found: Unknown Supplier");
    expect(results[0].error?.type).toBe("soft");
    expect(results[0].error?.field).toBe("supplier_name");
  });

  it("supplier_name matches case-insensitively → no error", () => {
    const lookups = { ...emptyLookups, supplierNames: new Set(["omron"]) };
    const rows = [{ ...baseRow, supplier_name: "OMRON" }];
    const results = validateComponentRows(rows, lookups);
    expect(results[0].error).toBeUndefined();
  });

  it("group_name not found → soft error, field = group_name", () => {
    const lookups = { ...emptyLookups, groupNames: new Set(["electronics"]) };
    const rows = [{ ...baseRow, group_name: "Unknown Group" }];
    const results = validateComponentRows(rows, lookups);
    expect(results[0].error?.message).toBe("Group not found: Unknown Group");
    expect(results[0].error?.type).toBe("soft");
    expect(results[0].error?.field).toBe("group_name");
  });

  it("location_name not found → hard error (locations are not resolvable)", () => {
    const lookups = { ...emptyLookups, locationNames: new Set(["warehouse a"]) };
    const rows = [{ ...baseRow, location_name: "Unknown Location" }];
    const results = validateComponentRows(rows, lookups);
    expect(results[0].error?.message).toBe("Location not found: Unknown Location");
    expect(results[0].error?.type).toBe("hard");
  });

  it("assigns rowIndex starting at 2 (header is row 1)", () => {
    const rows = [{ ...baseRow }];
    const results = validateComponentRows(rows, emptyLookups);
    expect(results[0].rowIndex).toBe(2);
  });

  it("returns first error per row (name check runs before sku check)", () => {
    const lookups = { ...emptyLookups, existingSkus: new Set(["X"]) };
    const rows = [{ ...baseRow, name: "", sku: "X" }];
    const results = validateComponentRows(rows, lookups);
    expect(results[0].error?.message).toBe("Name is required");
  });
});
