# CSV Import (Components + Suppliers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dedicated import pages at `/app/components/import` and `/app/suppliers/import` that let users bulk-create records from a CSV file, with a full preview + error-blocking step before committing.

**Architecture:** Client components manage a 3-step state machine (upload → preview → done). Each step POSTs the CSV file to an API route (`/api/import/components` or `/api/import/suppliers`) with a `dry_run` flag — dry run returns row-level validation results; commit re-validates then batch-inserts. Pure validation functions live in `src/lib/csv/` and are fully unit-tested with Vitest.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (via `getServerTenantContext`), Vitest, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-05-30-csv-import-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/csv/parse.ts` | `parseCSVLine`, `parseCSV` — shared parsing, extracted from stocktake |
| Create | `src/lib/csv/parse.test.ts` | Unit tests for CSV parsing |
| Create | `src/lib/csv/validate-components.ts` | Pure row validation for components (no DB) |
| Create | `src/lib/csv/validate-components.test.ts` | Unit tests for component validation |
| Create | `src/lib/csv/validate-suppliers.ts` | Pure row validation for suppliers (no DB) |
| Create | `src/lib/csv/validate-suppliers.test.ts` | Unit tests for supplier validation |
| Create | `src/app/api/import/components/route.ts` | POST handler: dry_run + commit for components |
| Create | `src/app/api/import/suppliers/route.ts` | POST handler: dry_run + commit for suppliers |
| Create | `src/app/app/_ui/import-page.module.css` | Shared CSS for import pages |
| Create | `src/app/app/components/import/page.tsx` | Components import client component |
| Create | `src/app/app/suppliers/import/page.tsx` | Suppliers import client component |
| Modify | `src/app/api/stocktake/[sessionId]/import/route.ts` | Replace inline parse fns with shared import |
| Modify | `src/app/app/components/page.tsx` | Add "Import CSV" link to page header actions |
| Modify | `src/app/app/suppliers/page.tsx` | Add "Import CSV" link to page header actions |

---

## Task 1: Shared CSV parse utility

**Files:**
- Create: `src/lib/csv/parse.ts`
- Create: `src/lib/csv/parse.test.ts`
- Modify: `src/app/api/stocktake/[sessionId]/import/route.ts`

- [ ] **Step 1: Add `.superpowers/` to `.gitignore`**

Open `.gitignore` at the project root and add this line (if not already present):
```
.superpowers/
```

- [ ] **Step 2: Create `src/lib/csv/parse.ts`**

```ts
/**
 * Shared CSV parsing helpers. Handles quoted fields and CRLF/LF line endings.
 */

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse a CSV string into an array of row objects keyed by the header row.
 * Extra columns in data rows are ignored. Missing columns default to "".
 */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const vals = parseCSVLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    });
}
```

- [ ] **Step 3: Write `src/lib/csv/parse.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseCSVLine, parseCSV } from "./parse";

describe("parseCSVLine", () => {
  it("splits a simple comma-separated line", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace around values", () => {
    expect(parseCSVLine(" a , b , c ")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCSVLine('"a,b",c')).toEqual(["a,b", "c"]);
  });

  it("handles escaped double-quotes inside a quoted field", () => {
    expect(parseCSVLine('"he said ""hi"""')).toEqual(['he said "hi"']);
  });

  it("returns a single-element array for a line with no commas", () => {
    expect(parseCSVLine("hello")).toEqual(["hello"]);
  });
});

describe("parseCSV", () => {
  it("returns empty array for a header-only string", () => {
    expect(parseCSV("name,sku")).toEqual([]);
  });

  it("parses rows keyed by header", () => {
    const result = parseCSV("name,sku\nBolt,BOLT-01");
    expect(result).toEqual([{ name: "Bolt", sku: "BOLT-01" }]);
  });

  it("handles CRLF line endings", () => {
    const result = parseCSV("name,sku\r\nBolt,BOLT-01");
    expect(result).toEqual([{ name: "Bolt", sku: "BOLT-01" }]);
  });

  it("skips blank lines", () => {
    const result = parseCSV("name,sku\nBolt,BOLT-01\n\nGasket,GSKT-01");
    expect(result).toHaveLength(2);
  });

  it("defaults missing columns to empty string", () => {
    const result = parseCSV("name,sku,unit\nBolt,BOLT-01");
    expect(result[0].unit).toBe("");
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- src/lib/csv/parse.test.ts
```
Expected: all 10 tests pass.

- [ ] **Step 5: Update stocktake import route to use shared util**

Open `src/app/api/stocktake/[sessionId]/import/route.ts`. Replace the two inline function definitions with an import:

Remove these lines (approximately lines 4–43):
```ts
function parseCSVLine(line: string): string[] {
  // ...entire function body...
}

function parseCSV(text: string): Record<string, string>[] {
  // ...entire function body...
}
```

Add this import at the top of the file (after the existing imports):
```ts
import { parseCSV } from "@/lib/csv/parse";
```

The rest of the file is unchanged — `parseCSV` is already called identically.

- [ ] **Step 6: Verify stocktake still works**

```
npm test
```
Expected: all existing tests pass (no new failures).

- [ ] **Step 7: Commit**

```
git add src/lib/csv/parse.ts src/lib/csv/parse.test.ts src/app/api/stocktake/[sessionId]/import/route.ts .gitignore
git commit -m "refactor: extract shared CSV parse utility from stocktake import"
```

---

## Task 2: Component row validation (pure, testable)

**Files:**
- Create: `src/lib/csv/validate-components.ts`
- Create: `src/lib/csv/validate-components.test.ts`

- [ ] **Step 1: Create `src/lib/csv/validate-components.ts`**

```ts
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

export type ValidatedRow = {
  /** 1-indexed row number in the original file (row 1 = header, data starts at 2) */
  rowIndex: number;
  /** Original raw string values from the CSV */
  raw: Record<string, string>;
  /** Set when this row fails validation */
  error?: string;
};

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

    if (!name) return { rowIndex, raw, error: "Name is required" };

    if (sku) {
      if (seenSkus.has(sku)) return { rowIndex, raw, error: "Duplicate SKU in file" };
      if (lookups.existingSkus.has(sku)) return { rowIndex, raw, error: "SKU already exists" };
      seenSkus.add(sku);
    }

    if (costRaw) {
      const n = Number(costRaw);
      if (!Number.isFinite(n) || n < 0)
        return { rowIndex, raw, error: "cost_per_unit must be a non-negative number" };
    }

    if (reorderRaw) {
      const n = Number(reorderRaw);
      if (!Number.isInteger(n) || n < 0)
        return { rowIndex, raw, error: "reorder_point must be a non-negative integer" };
    }

    if (lowStockRaw) {
      const n = Number(lowStockRaw);
      if (!Number.isInteger(n) || n < 0)
        return { rowIndex, raw, error: "low_stock_level must be a non-negative integer" };
    }

    if (supplierName && !lookups.supplierNames.has(supplierName.toLowerCase()))
      return { rowIndex, raw, error: `Supplier not found: ${supplierName}` };

    if (locationName && !lookups.locationNames.has(locationName.toLowerCase()))
      return { rowIndex, raw, error: `Location not found: ${locationName}` };

    if (groupName && !lookups.groupNames.has(groupName.toLowerCase()))
      return { rowIndex, raw, error: `Group not found: ${groupName}` };

    return { rowIndex, raw };
  });
}
```

- [ ] **Step 2: Write `src/lib/csv/validate-components.test.ts`**

```ts
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
```

- [ ] **Step 3: Run tests**

```
npm test -- src/lib/csv/validate-components.test.ts
```
Expected: all 12 tests pass.

- [ ] **Step 4: Commit**

```
git add src/lib/csv/validate-components.ts src/lib/csv/validate-components.test.ts
git commit -m "feat: component CSV row validation (pure, testable)"
```

---

## Task 3: Supplier row validation (pure, testable)

**Files:**
- Create: `src/lib/csv/validate-suppliers.ts`
- Create: `src/lib/csv/validate-suppliers.test.ts`

- [ ] **Step 1: Create `src/lib/csv/validate-suppliers.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/lib/csv/validate-suppliers.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { validateSupplierRows } from "./validate-suppliers";

const noExisting = new Set<string>();

describe("validateSupplierRows", () => {
  it("passes a fully-valid row", () => {
    const rows = [{ name: "Omron", website: "https://omron.com", default_lead_time_days: "14", contact_name: "Jane", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "AUD" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBeUndefined();
  });

  it("fails when name is blank", () => {
    const rows = [{ name: "", website: "", default_lead_time_days: "", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBe("Name is required");
  });

  it("fails when name is duplicated within file (case-insensitive)", () => {
    const rows = [
      { name: "Omron", website: "", default_lead_time_days: "", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" },
      { name: "OMRON", website: "", default_lead_time_days: "", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" },
    ];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toBe("Duplicate name in file");
  });

  it("fails when name already exists in DB (case-insensitive)", () => {
    const existing = new Set(["siemens"]);
    const rows = [{ name: "Siemens", website: "", default_lead_time_days: "", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, existing);
    expect(results[0].error).toBe("Supplier already exists");
  });

  it("fails when default_lead_time_days is a decimal", () => {
    const rows = [{ name: "Omron", website: "", default_lead_time_days: "3.5", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBe("default_lead_time_days must be a non-negative integer");
  });

  it("fails when default_lead_time_days is negative", () => {
    const rows = [{ name: "Omron", website: "", default_lead_time_days: "-1", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBe("default_lead_time_days must be a non-negative integer");
  });

  it("accepts default_lead_time_days of zero", () => {
    const rows = [{ name: "Omron", website: "", default_lead_time_days: "0", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBeUndefined();
  });

  it("assigns rowIndex starting at 2", () => {
    const rows = [{ name: "Omron", website: "", default_lead_time_days: "", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].rowIndex).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests**

```
npm test -- src/lib/csv/validate-suppliers.test.ts
```
Expected: all 8 tests pass.

- [ ] **Step 4: Commit**

```
git add src/lib/csv/validate-suppliers.ts src/lib/csv/validate-suppliers.test.ts
git commit -m "feat: supplier CSV row validation (pure, testable)"
```

---

## Task 4: Components import API route

**Files:**
- Create: `src/app/api/import/components/route.ts`

The route handles both dry run (preview) and commit. On commit it re-validates server-side — never trusts client state.

- [ ] **Step 1: Create `src/app/api/import/components/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { parseCSV } from "@/lib/csv/parse";
import { validateComponentRows, type ComponentLookups } from "@/lib/csv/validate-components";

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
const REQUIRED_HEADERS = ["name"];

export async function POST(req: NextRequest) {
  const context = await getServerTenantContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, tenantId } = context;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const dryRun = formData.get("dry_run") === "true";

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_CSV_BYTES)
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });

  const text = await file.text();
  const rows = parseCSV(text);

  // File-level checks
  if (rows.length === 0)
    return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
  for (const col of REQUIRED_HEADERS) {
    if (!(col in rows[0]))
      return NextResponse.json({ error: `Missing required column: ${col}` }, { status: 400 });
  }

  // Fetch DB lookups — select id + name so we have both for commit resolution
  const [
    { data: supplierRecords },
    { data: locationRecords },
    { data: groupRecords },
    { data: existingComponents },
  ] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId),
    supabase.from("location").select("id, name").eq("tenant_id", tenantId),
    supabase.from("component_group").select("id, name").eq("tenant_id", tenantId),
    supabase.from("component").select("sku").eq("tenant_id", tenantId).not("sku", "is", null),
  ]);

  const supplierIdMap = new Map(
    (supplierRecords ?? []).map((s) => [s.name.toLowerCase(), s.id as string])
  );
  const locationIdMap = new Map(
    (locationRecords ?? []).map((l) => [l.name.toLowerCase(), l.id as string])
  );
  const groupIdMap = new Map(
    (groupRecords ?? []).map((g) => [g.name.toLowerCase(), g.id as string])
  );

  const lookups: ComponentLookups = {
    supplierNames: new Set(supplierIdMap.keys()),
    locationNames: new Set(locationIdMap.keys()),
    groupNames: new Set(groupIdMap.keys()),
    existingSkus: new Set(
      (existingComponents ?? []).map((c) => c.sku as string).filter(Boolean)
    ),
  };

  const validatedRows = validateComponentRows(rows, lookups);

  // Dry run — return preview data
  if (dryRun) {
    return NextResponse.json({ rows: validatedRows });
  }

  // Commit — re-validate, then insert
  const errors = validatedRows.filter((r) => r.error);
  if (errors.length > 0)
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const insertRows = validatedRows.map((r) => {
    const raw = r.raw;
    const supplierName = raw["supplier_name"]?.trim() || null;
    const locationName = raw["location_name"]?.trim() || null;
    const groupName = raw["group_name"]?.trim() || null;

    return {
      tenant_id: tenantId,
      name: raw["name"].trim(),
      sku: raw["sku"]?.trim() || null,
      unit: raw["unit"]?.trim() || null,
      cost_per_unit: raw["cost_per_unit"]?.trim() ? Number(raw["cost_per_unit"]) : 0,
      reorder_point: raw["reorder_point"]?.trim() ? Number(raw["reorder_point"]) : 0,
      low_stock_level: raw["low_stock_level"]?.trim() ? Number(raw["low_stock_level"]) : 0,
      supplier_id: supplierName ? (supplierIdMap.get(supplierName.toLowerCase()) ?? null) : null,
      location_id: locationName ? (locationIdMap.get(locationName.toLowerCase()) ?? null) : null,
      group_id: groupName ? (groupIdMap.get(groupName.toLowerCase()) ?? null) : null,
    };
  });

  const { error } = await supabase.from("component").insert(insertRows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "components_csv_imported",
    metadata: { count: insertRows.length },
  });

  revalidatePath("/app/components");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");

  return NextResponse.json({ imported: insertRows.length });
}
```

- [ ] **Step 2: Smoke-test the route manually**

Start the dev server (`npm run dev`) and use curl or a REST client:

```bash
# Dry run with a minimal valid CSV
curl -X POST http://localhost:3000/api/import/components \
  -F "file=@/path/to/test.csv" \
  -F "dry_run=true"
```

Where `test.csv` contains:
```
name,sku,unit
Safety Scanner,CMP-001,ea
```

Expected: `200` with `{ "rows": [{ "rowIndex": 2, "raw": {...}, "error": undefined }] }` (no error field on valid rows).

Test an error case by sending a CSV with a blank name:
```
name,sku
,BOLT-01
```
Expected: `200` with `{ "rows": [{ "rowIndex": 2, "raw": {...}, "error": "Name is required" }] }`.

- [ ] **Step 3: Commit**

```
git add src/app/api/import/components/route.ts
git commit -m "feat: components CSV import API route (dry_run + commit)"
```

---

## Task 5: Suppliers import API route

**Files:**
- Create: `src/app/api/import/suppliers/route.ts`

- [ ] **Step 1: Create `src/app/api/import/suppliers/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { parseCSV } from "@/lib/csv/parse";
import { validateSupplierRows } from "@/lib/csv/validate-suppliers";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const REQUIRED_HEADERS = ["name"];

export async function POST(req: NextRequest) {
  const context = await getServerTenantContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, tenantId } = context;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const dryRun = formData.get("dry_run") === "true";

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_CSV_BYTES)
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });

  const text = await file.text();
  const rows = parseCSV(text);

  if (rows.length === 0)
    return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
  for (const col of REQUIRED_HEADERS) {
    if (!(col in rows[0]))
      return NextResponse.json({ error: `Missing required column: ${col}` }, { status: 400 });
  }

  // Fetch existing supplier names for duplicate detection
  const { data: existingSuppliers } = await supabase
    .from("suppliers")
    .select("name")
    .eq("tenant_id", tenantId);

  const existingNames = new Set(
    (existingSuppliers ?? []).map((s) => s.name.toLowerCase())
  );

  const validatedRows = validateSupplierRows(rows, existingNames);

  if (dryRun) {
    return NextResponse.json({ rows: validatedRows });
  }

  // Commit
  const errors = validatedRows.filter((r) => r.error);
  if (errors.length > 0)
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const insertRows = validatedRows.map((r) => {
    const raw = r.raw;
    const leadTime = raw["default_lead_time_days"]?.trim();
    return {
      tenant_id: tenantId,
      name: raw["name"].trim(),
      website: raw["website"]?.trim() || null,
      default_lead_time_days: leadTime ? Number(leadTime) : null,
      contact_name: raw["contact_name"]?.trim() || null,
      contact_email: raw["contact_email"]?.trim() || null,
      contact_phone: raw["contact_phone"]?.trim() || null,
      address: raw["address"]?.trim() || null,
      payment_terms: raw["payment_terms"]?.trim() || null,
      default_currency: raw["default_currency"]?.trim() || null,
    };
  });

  const { error } = await supabase.from("suppliers").insert(insertRows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "suppliers_csv_imported",
    metadata: { count: insertRows.length },
  });

  revalidatePath("/app/suppliers");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/activity-log");

  return NextResponse.json({ imported: insertRows.length });
}
```

- [ ] **Step 2: Smoke-test the route manually**

With dev server running:
```bash
curl -X POST http://localhost:3000/api/import/suppliers \
  -F "file=@/path/to/suppliers.csv" \
  -F "dry_run=true"
```

Where `suppliers.csv` contains:
```
name,website,default_lead_time_days
Omron,https://omron.com,14
Siemens,,30
```

Expected: `200` with 2 rows, no errors.

Test with a duplicate name:
```
name
Omron
Omron
```
Expected: row 2 has `"error": "Duplicate name in file"`.

- [ ] **Step 3: Commit**

```
git add src/app/api/import/suppliers/route.ts
git commit -m "feat: suppliers CSV import API route (dry_run + commit)"
```

---

## Task 6: Shared import page CSS

**Files:**
- Create: `src/app/app/_ui/import-page.module.css`

- [ ] **Step 1: Create `src/app/app/_ui/import-page.module.css`**

```css
/* Shared styles for /components/import and /suppliers/import pages */

.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 900px;
}

.back {
  font-size: 0.85rem;
  color: var(--ink-muted);
  text-decoration: none;
}
.back:hover { color: var(--ink-strong); }

.title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ink-strong);
  margin: 0;
}

/* ── Step indicator ── */
.stepBar {
  display: flex;
  align-items: center;
  gap: 0;
}

.stepItem {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.85rem;
  color: var(--ink-muted);
}

.stepActive {
  color: var(--brand-1);
  font-weight: 600;
}

.stepDone {
  color: var(--ok, #2e7d32);
}

.stepNum {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 1.5px solid var(--stroke-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  flex-shrink: 0;
}

.stepActive .stepNum {
  background: var(--brand-1);
  border-color: var(--brand-1);
  color: #fff;
}

.stepDone .stepNum {
  background: var(--ok, #2e7d32);
  border-color: var(--ok, #2e7d32);
  color: #fff;
}

.stepConnector {
  width: 32px;
  height: 1px;
  background: var(--stroke-strong);
  margin: 0 4px;
}

/* ── Upload step ── */
.section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dropZone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 24px;
  border: 2px dashed var(--stroke-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-page);
  cursor: pointer;
  text-align: center;
  transition: border-color 140ms ease, background 140ms ease;
}
.dropZone:hover {
  border-color: var(--brand-1);
  background: var(--surface-hover);
}

.hiddenInput {
  display: none;
}

.dropIcon { font-size: 2rem; }

.dropTitle {
  font-weight: 600;
  color: var(--ink-strong);
  font-size: 0.95rem;
}

.dropSub {
  font-size: 0.8rem;
  color: var(--ink-muted);
}

.templateBox {
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  font-size: 0.8rem;
  color: var(--ink-muted);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.templateBox code {
  font-size: 0.75rem;
  color: var(--ink-strong);
}

.templateLink {
  all: unset;
  color: var(--brand-1);
  text-decoration: underline;
  cursor: pointer;
  font-size: 0.8rem;
}
.templateLink:hover { opacity: 0.8; }

/* ── Error banner ── */
.errorBanner {
  padding: 10px 14px;
  background: var(--danger-dim);
  border: 1px solid var(--danger-dim);
  border-radius: var(--radius-lg);
  color: var(--danger);
  font-size: 0.83rem;
  margin: 0;
}

/* ── Preview table ── */
.tableWrap {
  overflow-x: auto;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  max-height: 65vh;
  overflow-y: auto;
}

.previewTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.previewTable thead th {
  padding: 8px 10px;
  text-align: left;
  background: var(--bg-page);
  border-bottom: 1px solid var(--stroke-strong);
  font-size: 0.75rem;
  color: var(--ink-muted);
  font-weight: 600;
  position: sticky;
  top: 0;
}

.previewTable tbody td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--stroke-soft, #eee);
  color: var(--ink-strong);
}

.rowError td {
  background: var(--danger-dim);
}

.errorLabel {
  color: var(--danger);
  font-size: 0.77rem;
  font-weight: 600;
}

.okLabel {
  color: var(--ok, #2e7d32);
  font-size: 0.77rem;
}

.missing { color: var(--ink-muted); }

.previewMeta {
  font-size: 0.78rem;
  color: var(--ink-muted);
  text-align: right;
}

/* ── Actions row ── */
.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.primaryBtn {
  composes: primary from "./buttons.module.css";
}

.primaryBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: none;
}

.secondaryBtn {
  composes: secondary from "./buttons.module.css";
}

/* ── Done step ── */
.doneSection {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px;
  background: var(--bg-card);
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
}

.doneIcon { font-size: 2rem; }

.doneMsg {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink-strong);
  margin: 0;
}
```

- [ ] **Step 2: Commit**

```
git add src/app/app/_ui/import-page.module.css
git commit -m "feat: shared CSS for import pages"
```

---

## Task 7: Components import page

**Files:**
- Create: `src/app/app/components/import/page.tsx`

- [ ] **Step 1: Create `src/app/app/components/import/page.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import styles from "../../_ui/import-page.module.css";

type Step = "upload" | "preview" | "done";

type PreviewRow = {
  rowIndex: number;
  raw: Record<string, string>;
  error?: string;
};

const TEMPLATE_CSV = [
  "name,sku,unit,cost_per_unit,reorder_point,low_stock_level,supplier_name,location_name,group_name",
  "Safety Laser Scanner,CMP-001,ea,142.00,10,5,Omron,Warehouse A,Electronics",
].join("\n");

export default function ComponentsImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileRef, setFileRef] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "components-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileRef(file);
    setFileError(null);
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", "true");
    try {
      const res = await fetch("/api/import/components", { method: "POST", body: fd });
      const json = (await res.json()) as { rows?: PreviewRow[]; error?: string };
      if (!res.ok) {
        setFileError(json.error ?? "Validation failed");
      } else {
        setRows(json.rows ?? []);
        setStep("preview");
      }
    } catch {
      setFileError("Network error — please try again.");
    }
    setLoading(false);
  }

  async function handleImport() {
    if (!fileRef) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("file", fileRef);
    fd.append("dry_run", "false");
    try {
      const res = await fetch("/api/import/components", { method: "POST", body: fd });
      const json = (await res.json()) as { imported?: number; error?: string };
      if (!res.ok) {
        setFileError(json.error ?? "Import failed");
        setStep("upload");
      } else {
        setImportedCount(json.imported ?? 0);
        setStep("done");
      }
    } catch {
      setFileError("Network error — please try again.");
      setStep("upload");
    }
    setLoading(false);
  }

  function resetToUpload() {
    setStep("upload");
    setRows([]);
    setFileRef(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const errorCount = rows.filter((r) => r.error).length;
  const hasErrors = errorCount > 0;
  const uploadDone = step !== "upload";
  const previewDone = step === "done";

  return (
    <div className={styles.page}>
      <Link href="/app/components" className={styles.back}>
        ← Back to Components
      </Link>
      <h1 className={styles.title}>Import Components from CSV</h1>

      {/* Step indicator */}
      <div className={styles.stepBar}>
        <div className={`${styles.stepItem} ${!uploadDone ? styles.stepActive : styles.stepDone}`}>
          <span className={styles.stepNum}>{uploadDone ? "✓" : "1"}</span>
          Upload
        </div>
        <div className={styles.stepConnector} />
        <div className={`${styles.stepItem} ${step === "preview" ? styles.stepActive : previewDone ? styles.stepDone : ""}`}>
          <span className={styles.stepNum}>{previewDone ? "✓" : "2"}</span>
          Preview
        </div>
        <div className={styles.stepConnector} />
        <div className={`${styles.stepItem} ${step === "done" ? styles.stepActive : ""}`}>
          <span className={styles.stepNum}>3</span>
          Done
        </div>
      </div>

      {/* Upload step */}
      {step === "upload" && (
        <div className={styles.section}>
          <label className={styles.dropZone}>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className={styles.hiddenInput}
              onChange={handleFileChange}
              disabled={loading}
            />
            <span className={styles.dropIcon}>📂</span>
            <span className={styles.dropTitle}>
              {loading ? "Validating…" : "Drop your CSV here"}
            </span>
            <span className={styles.dropSub}>
              or click to browse — .csv only, max 5 MB
            </span>
          </label>

          {fileError && <p className={styles.errorBanner}>{fileError}</p>}

          <div className={styles.templateBox}>
            <strong>CSV format:</strong>{" "}
            <code>
              name, sku, unit, cost_per_unit, reorder_point, low_stock_level, supplier_name,
              location_name, group_name
            </code>
            <button type="button" className={styles.templateLink} onClick={downloadTemplate}>
              ↓ Download template
            </button>
          </div>
        </div>
      )}

      {/* Preview step */}
      {step === "preview" && (
        <div className={styles.section}>
          {hasErrors && (
            <p className={styles.errorBanner}>
              ⚠️ <strong>{errorCount} error{errorCount !== 1 ? "s" : ""}</strong> found — fix
              your CSV and re-upload to proceed.
            </p>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Unit</th>
                  <th>Cost/unit</th>
                  <th>Supplier</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowIndex} className={row.error ? styles.rowError : ""}>
                    <td>{row.rowIndex}</td>
                    <td>{row.raw["name"] || <em className={styles.missing}>—</em>}</td>
                    <td>{row.raw["sku"] || "—"}</td>
                    <td>{row.raw["unit"] || "—"}</td>
                    <td>{row.raw["cost_per_unit"] || "—"}</td>
                    <td>{row.raw["supplier_name"] || "—"}</td>
                    <td>
                      {row.error ? (
                        <span className={styles.errorLabel}>✗ {row.error}</span>
                      ) : (
                        <span className={styles.okLabel}>✓ OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.previewMeta}>
            {rows.length} row{rows.length !== 1 ? "s" : ""} · {errorCount} error
            {errorCount !== 1 ? "s" : ""}
          </p>

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={resetToUpload}>
              Re-upload CSV
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={hasErrors || loading}
              onClick={handleImport}
            >
              {loading ? "Importing…" : `Import ${rows.length} Components`}
            </button>
          </div>
        </div>
      )}

      {/* Done step */}
      {step === "done" && (
        <div className={styles.doneSection}>
          <span className={styles.doneIcon}>✅</span>
          <p className={styles.doneMsg}>{importedCount} components imported successfully.</p>
          <div className={styles.actions}>
            <Link href="/app/components" className={styles.primaryBtn}>
              View Components
            </Link>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                resetToUpload();
                setImportedCount(0);
              }}
            >
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual end-to-end test**

With dev server running, navigate to `http://localhost:3000/app/components/import`.

1. Verify step indicator shows "Upload" as active.
2. Click "Download template" — confirm `components-template.csv` downloads with correct headers.
3. Upload a CSV with one valid row — confirm step moves to "Preview", row shows ✓ OK.
4. Click "Import N Components" — confirm step moves to "Done" with the correct count.
5. Click "View Components" — confirm redirect to `/app/components` and the new components appear.
6. Upload a CSV with a blank name — confirm error row is shown and "Import" button is disabled.
7. Click "Re-upload CSV" — confirm step resets to Upload.

- [ ] **Step 3: Commit**

```
git add src/app/app/components/import/page.tsx
git commit -m "feat: components import page (upload → preview → done)"
```

---

## Task 8: Suppliers import page

**Files:**
- Create: `src/app/app/suppliers/import/page.tsx`

- [ ] **Step 1: Create `src/app/app/suppliers/import/page.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import styles from "../../_ui/import-page.module.css";

type Step = "upload" | "preview" | "done";

type PreviewRow = {
  rowIndex: number;
  raw: Record<string, string>;
  error?: string;
};

const TEMPLATE_CSV = [
  "name,website,default_lead_time_days,contact_name,contact_email,contact_phone,address,payment_terms,default_currency",
  "Omron,https://omron.com,14,Jane Smith,jane@omron.com,+61 2 1234 5678,123 Main St,Net 30,AUD",
].join("\n");

export default function SuppliersImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileRef, setFileRef] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "suppliers-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileRef(file);
    setFileError(null);
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", "true");
    try {
      const res = await fetch("/api/import/suppliers", { method: "POST", body: fd });
      const json = (await res.json()) as { rows?: PreviewRow[]; error?: string };
      if (!res.ok) {
        setFileError(json.error ?? "Validation failed");
      } else {
        setRows(json.rows ?? []);
        setStep("preview");
      }
    } catch {
      setFileError("Network error — please try again.");
    }
    setLoading(false);
  }

  async function handleImport() {
    if (!fileRef) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("file", fileRef);
    fd.append("dry_run", "false");
    try {
      const res = await fetch("/api/import/suppliers", { method: "POST", body: fd });
      const json = (await res.json()) as { imported?: number; error?: string };
      if (!res.ok) {
        setFileError(json.error ?? "Import failed");
        setStep("upload");
      } else {
        setImportedCount(json.imported ?? 0);
        setStep("done");
      }
    } catch {
      setFileError("Network error — please try again.");
      setStep("upload");
    }
    setLoading(false);
  }

  function resetToUpload() {
    setStep("upload");
    setRows([]);
    setFileRef(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const errorCount = rows.filter((r) => r.error).length;
  const hasErrors = errorCount > 0;
  const uploadDone = step !== "upload";
  const previewDone = step === "done";

  return (
    <div className={styles.page}>
      <Link href="/app/suppliers" className={styles.back}>
        ← Back to Suppliers
      </Link>
      <h1 className={styles.title}>Import Suppliers from CSV</h1>

      {/* Step indicator */}
      <div className={styles.stepBar}>
        <div className={`${styles.stepItem} ${!uploadDone ? styles.stepActive : styles.stepDone}`}>
          <span className={styles.stepNum}>{uploadDone ? "✓" : "1"}</span>
          Upload
        </div>
        <div className={styles.stepConnector} />
        <div className={`${styles.stepItem} ${step === "preview" ? styles.stepActive : previewDone ? styles.stepDone : ""}`}>
          <span className={styles.stepNum}>{previewDone ? "✓" : "2"}</span>
          Preview
        </div>
        <div className={styles.stepConnector} />
        <div className={`${styles.stepItem} ${step === "done" ? styles.stepActive : ""}`}>
          <span className={styles.stepNum}>3</span>
          Done
        </div>
      </div>

      {/* Upload step */}
      {step === "upload" && (
        <div className={styles.section}>
          <label className={styles.dropZone}>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className={styles.hiddenInput}
              onChange={handleFileChange}
              disabled={loading}
            />
            <span className={styles.dropIcon}>📂</span>
            <span className={styles.dropTitle}>
              {loading ? "Validating…" : "Drop your CSV here"}
            </span>
            <span className={styles.dropSub}>
              or click to browse — .csv only, max 5 MB
            </span>
          </label>

          {fileError && <p className={styles.errorBanner}>{fileError}</p>}

          <div className={styles.templateBox}>
            <strong>CSV format:</strong>{" "}
            <code>
              name, website, default_lead_time_days, contact_name, contact_email, contact_phone,
              address, payment_terms, default_currency
            </code>
            <button type="button" className={styles.templateLink} onClick={downloadTemplate}>
              ↓ Download template
            </button>
          </div>
        </div>
      )}

      {/* Preview step */}
      {step === "preview" && (
        <div className={styles.section}>
          {hasErrors && (
            <p className={styles.errorBanner}>
              ⚠️ <strong>{errorCount} error{errorCount !== 1 ? "s" : ""}</strong> found — fix
              your CSV and re-upload to proceed.
            </p>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Website</th>
                  <th>Lead time (days)</th>
                  <th>Contact name</th>
                  <th>Currency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowIndex} className={row.error ? styles.rowError : ""}>
                    <td>{row.rowIndex}</td>
                    <td>{row.raw["name"] || <em className={styles.missing}>—</em>}</td>
                    <td>{row.raw["website"] || "—"}</td>
                    <td>{row.raw["default_lead_time_days"] || "—"}</td>
                    <td>{row.raw["contact_name"] || "—"}</td>
                    <td>{row.raw["default_currency"] || "—"}</td>
                    <td>
                      {row.error ? (
                        <span className={styles.errorLabel}>✗ {row.error}</span>
                      ) : (
                        <span className={styles.okLabel}>✓ OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.previewMeta}>
            {rows.length} row{rows.length !== 1 ? "s" : ""} · {errorCount} error
            {errorCount !== 1 ? "s" : ""}
          </p>

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={resetToUpload}>
              Re-upload CSV
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={hasErrors || loading}
              onClick={handleImport}
            >
              {loading ? "Importing…" : `Import ${rows.length} Suppliers`}
            </button>
          </div>
        </div>
      )}

      {/* Done step */}
      {step === "done" && (
        <div className={styles.doneSection}>
          <span className={styles.doneIcon}>✅</span>
          <p className={styles.doneMsg}>{importedCount} suppliers imported successfully.</p>
          <div className={styles.actions}>
            <Link href="/app/suppliers" className={styles.primaryBtn}>
              View Suppliers
            </Link>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                resetToUpload();
                setImportedCount(0);
              }}
            >
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual end-to-end test**

Navigate to `http://localhost:3000/app/suppliers/import`.

1. Download template — confirm `suppliers-template.csv` with correct headers.
2. Upload valid CSV — confirm preview shows rows with ✓ OK.
3. Commit — confirm done screen with correct count and "View Suppliers" link.
4. Navigate to `/app/suppliers` — confirm imported suppliers appear.
5. Try uploading a CSV with a name that already exists — confirm "Supplier already exists" error.

- [ ] **Step 3: Commit**

```
git add src/app/app/suppliers/import/page.tsx
git commit -m "feat: suppliers import page (upload → preview → done)"
```

---

## Task 9: Navigation entry points

**Files:**
- Modify: `src/app/app/components/page.tsx`
- Modify: `src/app/app/suppliers/page.tsx`

- [ ] **Step 1: Add "Import CSV" link to components page**

Open `src/app/app/components/page.tsx`. Find the `actions` prop passed to `<PageHeader>`:

```tsx
actions={<ComponentCreateForm action={createComponent} lookups={lookups} />}
```

Replace with:

```tsx
actions={
  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
    <Link href="/app/components/import" className={styles.importLink}>
      Import CSV
    </Link>
    <ComponentCreateForm action={createComponent} lookups={lookups} />
  </div>
}
```

Then open `src/app/app/components/components.module.css` and add:

```css
.importLink {
  composes: secondary from "../_ui/buttons.module.css";
}
```

- [ ] **Step 2: Add "Import CSV" link to suppliers page**

Open `src/app/app/suppliers/page.tsx`. Find the `actions` prop:

```tsx
actions={<SupplierCreateForm action={createSupplier} />}
```

Replace with:

```tsx
actions={
  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
    <Link href="/app/suppliers/import" className={styles.importLink}>
      Import CSV
    </Link>
    <SupplierCreateForm action={createSupplier} />
  </div>
}
```

Then open `src/app/app/suppliers/suppliers.module.css` and add:

```css
.importLink {
  composes: secondary from "../_ui/buttons.module.css";
}
```

- [ ] **Step 3: Verify navigation**

In the browser:
- `/app/components` — confirm "Import CSV" button appears in the page header, styled as a secondary button, and clicking it navigates to `/app/components/import`.
- `/app/suppliers` — same for suppliers.

- [ ] **Step 4: Run all tests**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add src/app/app/components/page.tsx src/app/app/components/components.module.css src/app/app/suppliers/page.tsx src/app/app/suppliers/suppliers.module.css
git commit -m "feat: add Import CSV navigation to components and suppliers pages"
```
