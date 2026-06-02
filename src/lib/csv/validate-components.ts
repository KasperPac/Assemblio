/**
 * Pure row-level validation for components CSV import.
 * No DB calls — caller provides pre-fetched lookup sets.
 */

export type ComponentLookups = {
  /** Lowercase supplier names from the DB */
  supplierNames: Set<string>;
  /** Lowercase location names from the DB */
  locationNames: Set<string>;
  /** Lowercase component group names from the DB */
  groupNames: Set<string>;
  /** Exact-case SKUs already in the DB for this tenant */
  existingSkus: Set<string>;
};

export type RowError = {
  message: string;
  /** hard = must fix CSV and re-upload; soft = resolvable via the Resolve step */
  type: "hard" | "soft";
  /** Column name that caused the error — only set on soft errors */
  field?: string;
};

export type ValidatedRow = {
  /** 1-indexed row number in the original file (row 1 = header, data starts at 2) */
  rowIndex: number;
  /** Original raw string values from the CSV */
  raw: Record<string, string>;
  /** Set when this row fails validation */
  error?: RowError;
};

function hard(message: string): RowError {
  return { message, type: "hard" };
}

function soft(message: string, field: string): RowError {
  return { message, type: "soft", field };
}

/**
 * Validate an array of parsed CSV rows.
 * Returns one ValidatedRow per input row; rows with errors have `error` set.
 * Validation order: name → sku uniqueness → sku exists → numeric fields → lookups.
 */
export function validateComponentRows(
  rows: Record<string, string>[],
  lookups: ComponentLookups
): ValidatedRow[] {
  const seenSkus = new Set<string>();

  return rows.map((row, i) => {
    const rowIndex = i + 2; // header is row 1
    const raw = row;

    const name = (row["name"] ?? "").trim();
    const sku = (row["sku"] ?? "").trim() || null;
    const costRaw = (row["cost_per_unit"] ?? "").trim();
    const reorderRaw = (row["reorder_point"] ?? "").trim();
    const lowStockRaw = (row["low_stock_level"] ?? "").trim();
    const supplierName = (row["supplier_name"] ?? "").trim() || null;
    const locationName = (row["location_name"] ?? "").trim() || null;
    const groupName = (row["group_name"] ?? "").trim() || null;

    if (!name) return { rowIndex, raw, error: hard("Name is required") };

    if (sku) {
      if (seenSkus.has(sku)) return { rowIndex, raw, error: hard("Duplicate SKU in file") };
      if (lookups.existingSkus.has(sku)) return { rowIndex, raw, error: hard("SKU already exists") };
      seenSkus.add(sku);
    }

    if (costRaw) {
      const n = Number(costRaw);
      if (!Number.isFinite(n) || n < 0)
        return { rowIndex, raw, error: hard("cost_per_unit must be a non-negative number") };
    }

    if (reorderRaw) {
      const n = Number(reorderRaw);
      if (!Number.isInteger(n) || n < 0)
        return { rowIndex, raw, error: hard("reorder_point must be a non-negative integer") };
    }

    if (lowStockRaw) {
      const n = Number(lowStockRaw);
      if (!Number.isInteger(n) || n < 0)
        return { rowIndex, raw, error: hard("low_stock_level must be a non-negative integer") };
    }

    if (supplierName && !lookups.supplierNames.has(supplierName.toLowerCase()))
      return { rowIndex, raw, error: soft(`Supplier not found: ${supplierName}`, "supplier_name") };

    if (locationName && !lookups.locationNames.has(locationName.toLowerCase()))
      return { rowIndex, raw, error: hard(`Location not found: ${locationName}`) };

    if (groupName && !lookups.groupNames.has(groupName.toLowerCase()))
      return { rowIndex, raw, error: soft(`Group not found: ${groupName}`, "group_name") };

    return { rowIndex, raw };
  });
}
