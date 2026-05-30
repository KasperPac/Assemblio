/**
 * Pure row-level validation for suppliers CSV import.
 * No DB calls — caller provides pre-fetched existing name set.
 */

export type ValidatedSupplierRow = {
  rowIndex: number;
  raw: Record<string, string>;
  error?: string;
};

/**
 * @param rows       Parsed CSV rows (from parseCSV)
 * @param existingNames  Lowercase supplier names already in the DB for this tenant
 */
export function validateSupplierRows(
  rows: Record<string, string>[],
  existingNames: Set<string>
): ValidatedSupplierRow[] {
  const seenNames = new Set<string>();

  return rows.map((row, i) => {
    const rowIndex = i + 2;
    const raw = row;

    const name = (row["name"] ?? "").trim();
    const leadTimeRaw = (row["default_lead_time_days"] ?? "").trim();

    if (!name) return { rowIndex, raw, error: "Name is required" };

    const nameLower = name.toLowerCase();

    if (seenNames.has(nameLower)) return { rowIndex, raw, error: "Duplicate name in file" };
    if (existingNames.has(nameLower)) return { rowIndex, raw, error: "Supplier already exists" };

    seenNames.add(nameLower);

    if (leadTimeRaw) {
      const n = Number(leadTimeRaw);
      if (!Number.isInteger(n) || n < 0)
        return { rowIndex, raw, error: "default_lead_time_days must be a non-negative integer" };
    }

    return { rowIndex, raw };
  });
}
