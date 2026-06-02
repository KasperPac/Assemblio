# CSV Import — Unknown Supplier/Group Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-fail on unknown supplier/group names in the components CSV import with an interactive Resolve step that offers fuzzy-match suggestions, existing-record selection, and inline creation.

**Architecture:** Four focused tasks in dependency order: (1) pure fuzzy-match utility, (2) updated row validator that distinguishes hard vs. soft errors, (3) updated API route that computes unknowns on dry-run and accepts resolutions on commit, (4) updated import UI with the new Resolve step and CSS.

**Tech Stack:** TypeScript, Next.js 15 App Router, Supabase JS client, React (client component), CSS Modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-02-csv-import-resolution-design.md`

---

### Task 1: Fuzzy matching utility

**Goal:** Create `src/lib/csv/fuzzy.ts` — a pure, dependency-free Levenshtein-based best-match function — with full test coverage.

**Files:**
- Create: `src/lib/csv/fuzzy.ts`
- Create: `src/lib/csv/fuzzy.test.ts`

**Acceptance Criteria:**
- [ ] `bestMatch(query, candidates)` returns the closest candidate when distance ≤ 2 AND ratio ≤ 30%
- [ ] Returns `null` when no candidate meets the threshold
- [ ] Matching is case-insensitive; returned value preserves original candidate casing
- [ ] All tests pass

**Verify:** `npx vitest run src/lib/csv/fuzzy.test.ts` → all tests green

**Steps:**

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/csv/fuzzy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bestMatch } from "./fuzzy";

describe("bestMatch", () => {
  it("returns null for empty candidates", () => {
    expect(bestMatch("Bunnings", [])).toBeNull();
  });

  it("returns the candidate on exact match", () => {
    expect(bestMatch("Bunnings", ["Bunnings", "RS Components"])).toBe("Bunnings");
  });

  it("returns the candidate on exact match case-insensitively", () => {
    expect(bestMatch("bunnings", ["Bunnings"])).toBe("Bunnings");
  });

  it("matches a 1-edit typo (missing letter) — 'Bunnigs' → 'Bunnings'", () => {
    // insert 'n' before 'g': 1 edit, ratio = 1/8 = 0.125 ✓
    expect(bestMatch("Bunnigs", ["Bunnings", "RS Components"])).toBe("Bunnings");
  });

  it("matches a 2-edit typo — 'Bunigs' → 'Bunnings'", () => {
    // insert 'n' twice: 2 edits, ratio = 2/8 = 0.25 ✓
    expect(bestMatch("Bunigs", ["Bunnings"])).toBe("Bunnings");
  });

  it("matches 'Electonics' → 'Electronics' (1 edit)", () => {
    // insert 'r': 1 edit, ratio = 1/11 = 0.09 ✓
    expect(bestMatch("Electonics", ["Electronics", "Fasteners"])).toBe("Electronics");
  });

  it("returns null when distance exceeds 2 — 'Bung' → 'Bunnings' (4 edits)", () => {
    expect(bestMatch("Bung", ["Bunnings"])).toBeNull();
  });

  it("returns null when ratio exceeds 30% — short word with 2 edits", () => {
    // "ab" → "xz": distance 2, ratio = 2/2 = 1.0 > 0.30
    expect(bestMatch("ab", ["xz"])).toBeNull();
  });

  it("returns null when input is completely unrelated", () => {
    expect(bestMatch("xyz123", ["Bunnings", "RS Components"])).toBeNull();
  });

  it("returns the closest of multiple candidates", () => {
    // "Bunnigs" is 1 edit from "Bunnings", far from "RS Components"
    expect(bestMatch("Bunnigs", ["RS Components", "Bunnings"])).toBe("Bunnings");
  });

  it("is case-insensitive on both sides", () => {
    expect(bestMatch("BUNNIGS", ["bunnings"])).toBe("bunnings");
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail**

Run: `npx vitest run src/lib/csv/fuzzy.test.ts`
Expected: FAIL — "Cannot find module './fuzzy'"

- [ ] **Step 3: Implement `src/lib/csv/fuzzy.ts`**

```ts
/**
 * Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // dp[i][j] = edit distance between a[0..i-1] and b[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Find the best matching candidate for `query` using case-insensitive Levenshtein distance.
 *
 * Returns the closest candidate (original casing preserved) when:
 *   - distance ≤ 2, AND
 *   - distance / max(len(query), len(candidate)) ≤ 0.30
 *
 * Returns null if no candidate meets the threshold.
 */
export function bestMatch(query: string, candidates: string[]): string | null {
  const q = query.toLowerCase();
  let best: { candidate: string; dist: number } | null = null;

  for (const candidate of candidates) {
    const c = candidate.toLowerCase();
    const dist = levenshtein(q, c);
    const maxLen = Math.max(q.length, c.length);
    if (maxLen > 0 && dist <= 2 && dist / maxLen <= 0.3) {
      if (best === null || dist < best.dist) {
        best = { candidate, dist };
      }
    }
  }

  return best ? best.candidate : null;
}
```

- [ ] **Step 4: Run tests to confirm they all pass**

Run: `npx vitest run src/lib/csv/fuzzy.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/fuzzy.ts src/lib/csv/fuzzy.test.ts
git commit -m "feat(csv): add fuzzy bestMatch utility for typo detection"
```

---

### Task 2: Update validator — hard vs soft error types

**Goal:** Update `src/lib/csv/validate-components.ts` so that `error` is a structured object `{ message, type, field? }` instead of a plain string, with supplier/group mismatches returning `type: "soft"` and everything else returning `type: "hard"`.

**Files:**
- Modify: `src/lib/csv/validate-components.ts`
- Modify: `src/lib/csv/validate-components.test.ts`

**Acceptance Criteria:**
- [ ] `ValidatedRow.error` is `{ message: string; type: "hard" | "soft"; field?: string }` or `undefined`
- [ ] Supplier-not-found → `type: "soft"`, `field: "supplier_name"`
- [ ] Group-not-found → `type: "soft"`, `field: "group_name"`
- [ ] All other errors → `type: "hard"`, no `field`
- [ ] All tests pass (updated for new shape)

**Verify:** `npx vitest run src/lib/csv/validate-components.test.ts` → all tests green

**Steps:**

- [ ] **Step 1: Replace `src/lib/csv/validate-components.ts` with the updated implementation**

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
```

- [ ] **Step 2: Replace `src/lib/csv/validate-components.test.ts` with the updated tests**

All existing test cases are preserved; error assertions updated to the new `{ message, type, field? }` shape.

```ts
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
```

- [ ] **Step 3: Run the updated tests**

Run: `npx vitest run src/lib/csv/validate-components.test.ts`
Expected: all tests PASS

- [ ] **Step 4: Confirm all CSV tests still pass together**

Run: `npx vitest run src/lib/csv/`
Expected: all tests PASS (fuzzy + validate-components)

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/validate-components.ts src/lib/csv/validate-components.test.ts
git commit -m "feat(csv): structured hard/soft error types in component validator"
```

---

### Task 3: Update the components import API route

**Goal:** Update `src/app/api/import/components/route.ts` so the dry-run response includes `unknowns` (with fuzzy suggestions) and `allSuppliers`/`allGroups` for the Resolve step dropdowns; the commit path accepts a `resolutions` JSON payload, creates any new suppliers/groups, and merges resolved IDs before inserting.

**Files:**
- Modify: `src/app/api/import/components/route.ts`

**Acceptance Criteria:**
- [ ] Dry-run response includes `unknowns.suppliers`, `unknowns.groups`, `allSuppliers`, `allGroups`
- [ ] Fuzzy suggestions are computed for each unknown value using `bestMatch`
- [ ] Commit with no hard errors and complete `resolutions` succeeds and imports components
- [ ] Commit with missing resolutions for soft-mismatch values returns 400
- [ ] Commit with hard errors returns 400 regardless of resolutions
- [ ] `create_new` resolutions create the supplier/group record before inserting components
- [ ] Activity log entry still written on success

**Verify:** Manual test via the UI (Tasks 1–3 done, Task 4 not yet needed — you can test the API with curl or Postman if you like, but the full flow is verified in Task 4)

**Steps:**

- [ ] **Step 1: Replace the route with the updated implementation**

Replace `src/app/api/import/components/route.ts` entirely:

```ts
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { parseCSV } from "@/lib/csv/parse";
import { validateComponentRows, type ComponentLookups } from "@/lib/csv/validate-components";
import { bestMatch } from "@/lib/csv/fuzzy";

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
const REQUIRED_HEADERS = ["name"];

type Resolution =
  | { type: "use_existing"; id: string }
  | { type: "create_new"; name: string };

type Resolutions = {
  suppliers: Record<string, Resolution>;
  groups: Record<string, Resolution>;
};

export async function POST(req: NextRequest) {
  const context = await getServerTenantContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, tenantId, role } = context;
  if (!tenantId) return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const supplierList = supplierRecords ?? [];
  const groupList = groupRecords ?? [];

  const supplierIdMap = new Map(
    supplierList.map((s) => [s.name.toLowerCase(), s.id as string])
  );
  const locationIdMap = new Map(
    (locationRecords ?? []).map((l) => [l.name.toLowerCase(), l.id as string])
  );
  const groupIdMap = new Map(
    groupList.map((g) => [g.name.toLowerCase(), g.id as string])
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

  // ── Dry run ──────────────────────────────────────────────────────────────
  if (dryRun) {
    // Collect unique soft-mismatch values by inspecting the error field
    const supplierUnknowns = new Map<string, number>(); // csvValue → rowCount
    const groupUnknowns = new Map<string, number>();

    for (const row of validatedRows) {
      if (row.error?.type === "soft" && row.error.field) {
        const csvValue = row.raw[row.error.field]?.trim();
        if (!csvValue) continue;
        if (row.error.field === "supplier_name") {
          supplierUnknowns.set(csvValue, (supplierUnknowns.get(csvValue) ?? 0) + 1);
        } else if (row.error.field === "group_name") {
          groupUnknowns.set(csvValue, (groupUnknowns.get(csvValue) ?? 0) + 1);
        }
      }
    }

    const allSupplierNames = supplierList.map((s) => s.name);
    const allGroupNames = groupList.map((g) => g.name);

    return NextResponse.json({
      rows: validatedRows,
      unknowns: {
        suppliers: Array.from(supplierUnknowns.entries()).map(([csvValue, rowCount]) => ({
          csvValue,
          suggestion: bestMatch(csvValue, allSupplierNames),
          rowCount,
        })),
        groups: Array.from(groupUnknowns.entries()).map(([csvValue, rowCount]) => ({
          csvValue,
          suggestion: bestMatch(csvValue, allGroupNames),
          rowCount,
        })),
      },
      allSuppliers: supplierList.map((s) => ({ id: s.id as string, name: s.name })),
      allGroups: groupList.map((g) => ({ id: g.id as string, name: g.name })),
    });
  }

  // ── Commit ───────────────────────────────────────────────────────────────

  // Hard errors block the import regardless of resolutions
  const hardErrors = validatedRows.filter((r) => r.error?.type === "hard");
  if (hardErrors.length > 0)
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  // Parse the resolutions map sent by the client
  let resolutions: Resolutions = { suppliers: {}, groups: {} };
  const resolutionsRaw = formData.get("resolutions") as string | null;
  if (resolutionsRaw) {
    try {
      resolutions = JSON.parse(resolutionsRaw) as Resolutions;
    } catch {
      return NextResponse.json({ error: "Invalid resolutions JSON" }, { status: 400 });
    }
  }

  // Every soft-mismatch row must have a corresponding resolution
  for (const row of validatedRows) {
    if (row.error?.type === "soft" && row.error.field) {
      const csvValue = row.raw[row.error.field]?.trim() ?? "";
      if (row.error.field === "supplier_name" && !resolutions.suppliers[csvValue]) {
        return NextResponse.json(
          { error: `No resolution provided for supplier: ${csvValue}` },
          { status: 400 }
        );
      }
      if (row.error.field === "group_name" && !resolutions.groups[csvValue]) {
        return NextResponse.json(
          { error: `No resolution provided for group: ${csvValue}` },
          { status: 400 }
        );
      }
    }
  }

  // Apply resolutions: create new suppliers and merge all IDs into supplierIdMap
  for (const [csvValue, res] of Object.entries(resolutions.suppliers)) {
    if (res.type === "create_new") {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({ tenant_id: tenantId, name: res.name })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      supplierIdMap.set(csvValue.toLowerCase(), data.id as string);
    } else {
      supplierIdMap.set(csvValue.toLowerCase(), res.id);
    }
  }

  // Apply resolutions: create new component groups and merge all IDs into groupIdMap
  for (const [csvValue, res] of Object.entries(resolutions.groups)) {
    if (res.type === "create_new") {
      const { data, error } = await supabase
        .from("component_group")
        .insert({ tenant_id: tenantId, name: res.name })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      groupIdMap.set(csvValue.toLowerCase(), data.id as string);
    } else {
      groupIdMap.set(csvValue.toLowerCase(), res.id);
    }
  }

  // Build insert rows — supplierIdMap and groupIdMap now contain resolved entries
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

- [ ] **Step 2: Confirm TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to the changed files

- [ ] **Step 3: Commit**

```bash
git add src/app/api/import/components/route.ts
git commit -m "feat(csv): dry-run returns unknowns+suggestions; commit accepts resolutions"
```

---

### Task 4: Update import UI — Preview changes, Resolve step, CSS

**Goal:** Update `src/app/app/components/import/page.tsx` and `src/app/app/_ui/import-page.module.css` to implement the 4-step wizard: the Preview step now shows amber warnings for soft mismatches and routes to a new Resolve step; the Resolve step lets the user assign each unknown value before import.

**Files:**
- Modify: `src/app/app/components/import/page.tsx`
- Modify: `src/app/app/_ui/import-page.module.css`

**Acceptance Criteria:**
- [ ] Wizard bar shows 4 steps: Upload / Preview / Resolve / Done
- [ ] Soft-mismatch rows in Preview table show amber `⚠ Supplier 'X' needs resolution` (not red)
- [ ] Preview with only soft mismatches → "Next: Resolve →" button (primary); hard errors → "Re-upload CSV" only; clean → "Import N components →" (primary, skips Resolve)
- [ ] Resolve step shows one card per type (Suppliers, Groups) with only the unknowns for that import
- [ ] Fuzzy suggestion chip appears when `suggestion` is non-null; one-click resolves to that supplier/group
- [ ] Pick-existing dropdown lists all DB records of that type
- [ ] "+ Create new" expands an editable field pre-filled with the CSV value; user can rename before confirming
- [ ] Resolved values show green chip with undo link
- [ ] Import button on Resolve step disabled until all unknowns are resolved
- [ ] `resolutions` JSON is sent in FormData on commit
- [ ] New supplier/group records created by the server are reflected after import (revalidation handles this)

**Verify:** Upload a CSV with a typo'd supplier name (e.g., `Bunings` when `Bunnings` exists in the DB) and step through the full flow: Preview shows amber warning → Resolve shows "Did you mean Bunnings?" → accept → import succeeds → components appear in the list with the correct supplier.

**Steps:**

- [ ] **Step 1: Add new CSS classes to `src/app/app/_ui/import-page.module.css`**

Append the following to the end of the existing file:

```css
/* ── Soft-mismatch row (warning, resolvable) ── */
.rowWarning td {
  background: var(--warning-dim, #fffbeb);
}

.warningLabel {
  color: var(--warning);
  font-size: 0.77rem;
  font-weight: 600;
}

/* ── Resolve step ── */
.resolveSection {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.resolveCard {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  padding: 18px;
  display: flex;
  flex-direction: column;
}

.resolveCardTitle {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
  margin: 0 0 12px 0;
}

.mismatchRow {
  display: grid;
  grid-template-columns: 190px 1fr;
  align-items: start;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--stroke);
}

.mismatchRow:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.csvValueChip {
  font-family: monospace;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink-strong);
  background: var(--surface-1);
  padding: 3px 8px;
  border-radius: var(--radius-lg);
  display: inline-block;
}

.rowCount {
  font-size: var(--fs-xs);
  color: var(--ink-faint);
  margin-top: 4px;
}

.resolutionOptions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.suggestionChip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--brand-dim);
  border: 1px solid var(--brand-1);
  border-radius: var(--radius-lg);
  padding: 7px 12px;
  font-size: var(--fs-sm);
  color: var(--brand-1);
}

.suggestionLabel {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  background: var(--brand-1);
  color: var(--ink-on-brand);
  padding: 2px 6px;
  border-radius: var(--radius-lg);
  flex-shrink: 0;
}

.useSuggestionBtn {
  composes: primary from "./buttons.module.css";
  margin-left: auto;
  min-height: 30px !important;
  font-size: var(--fs-xs) !important;
  padding: 0 10px !important;
}

.orDivider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-xs);
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
}

.orDivider::before,
.orDivider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--stroke);
}

.optionGroup {
  display: flex;
  gap: 8px;
}

.existingSelect {
  flex: 1;
  height: 36px;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  padding: 0 10px;
  font-size: var(--fs-sm);
  color: var(--ink-strong);
  background: var(--bg-card);
}

.createNewBtn {
  all: unset;
  height: 36px;
  padding: 0 14px;
  border: 1.5px dashed var(--stroke-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  color: var(--brand-1);
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
}
.createNewBtn:hover {
  border-color: var(--brand-1);
  background: var(--brand-dim);
}

.createExpanded {
  display: flex;
  gap: 8px;
  align-items: center;
}

.createInput {
  flex: 1;
  height: 36px;
  border: 1.5px solid var(--brand-1);
  border-radius: var(--radius-lg);
  padding: 0 10px;
  font-size: var(--fs-sm);
  color: var(--ink-strong);
  background: var(--brand-dim);
  outline: none;
}

.confirmCreateBtn {
  composes: primary from "./buttons.module.css";
  min-height: 36px !important;
}

.cancelCreateLink {
  all: unset;
  font-size: var(--fs-xs);
  color: var(--ink-muted);
  cursor: pointer;
  text-decoration: underline;
}
.cancelCreateLink:hover {
  color: var(--ink-strong);
}

.resolvedChip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--ok);
  border-radius: var(--radius-lg);
  padding: 7px 12px;
  font-size: var(--fs-sm);
  color: var(--ok);
  font-weight: 500;
}

.undoLink {
  all: unset;
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--ink-muted);
  cursor: pointer;
  text-decoration: underline;
}
.undoLink:hover {
  color: var(--ink-strong);
}

.resolveActions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.resolveProgress {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}
```

- [ ] **Step 2: Replace `src/app/app/components/import/page.tsx` with the updated implementation**

```tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import styles from "../../_ui/import-page.module.css";

type Step = "upload" | "preview" | "resolve" | "done";

type PreviewRow = {
  rowIndex: number;
  raw: Record<string, string>;
  error?: { message: string; type: "hard" | "soft"; field?: string };
};

type UnknownValue = {
  csvValue: string;
  suggestion: string | null;
  rowCount: number;
};

type KnownRecord = { id: string; name: string };

type Resolution =
  | { type: "use_existing"; id: string; displayName: string }
  | { type: "create_new"; name: string };

type Resolutions = {
  suppliers: Record<string, Resolution>;
  groups: Record<string, Resolution>;
};

type CreateExpanded = {
  section: "suppliers" | "groups";
  csvValue: string;
  draft: string;
};

const TEMPLATE_CSV = [
  "name,sku,unit,cost_per_unit,reorder_point,low_stock_level,supplier_name,location_name,group_name",
  "Safety Laser Scanner,CMP-001,ea,142.00,10,5,Omron,Warehouse A,Electronics",
].join("\n");

export default function ComponentsImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [unknowns, setUnknowns] = useState<{ suppliers: UnknownValue[]; groups: UnknownValue[] }>({
    suppliers: [],
    groups: [],
  });
  const [resolutions, setResolutions] = useState<Resolutions>({ suppliers: {}, groups: {} });
  const [allSuppliers, setAllSuppliers] = useState<KnownRecord[]>([]);
  const [allGroups, setAllGroups] = useState<KnownRecord[]>([]);
  const [createExpanded, setCreateExpanded] = useState<CreateExpanded | null>(null);

  const fileRef = useRef<File | null>(null);
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
    fileRef.current = file;
    setFileError(null);
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", "true");
    try {
      const res = await fetch("/api/import/components", { method: "POST", body: fd });
      const json = (await res.json()) as {
        rows?: PreviewRow[];
        unknowns?: { suppliers: UnknownValue[]; groups: UnknownValue[] };
        allSuppliers?: KnownRecord[];
        allGroups?: KnownRecord[];
        error?: string;
      };
      if (!res.ok) {
        setFileError(json.error ?? "Validation failed");
      } else {
        setRows(json.rows ?? []);
        setUnknowns(json.unknowns ?? { suppliers: [], groups: [] });
        setAllSuppliers(json.allSuppliers ?? []);
        setAllGroups(json.allGroups ?? []);
        setResolutions({ suppliers: {}, groups: {} });
        setCreateExpanded(null);
        setStep("preview");
      }
    } catch {
      setFileError("Network error — please try again.");
    }
    setLoading(false);
  }

  async function handleImport() {
    if (!fileRef.current) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("file", fileRef.current);
    fd.append("dry_run", "false");
    // Serialize resolutions — strip displayName (server doesn't need it)
    const serverResolutions = {
      suppliers: Object.fromEntries(
        Object.entries(resolutions.suppliers).map(([k, v]) =>
          v.type === "use_existing" ? [k, { type: "use_existing", id: v.id }] : [k, v]
        )
      ),
      groups: Object.fromEntries(
        Object.entries(resolutions.groups).map(([k, v]) =>
          v.type === "use_existing" ? [k, { type: "use_existing", id: v.id }] : [k, v]
        )
      ),
    };
    fd.append("resolutions", JSON.stringify(serverResolutions));
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
    setUnknowns({ suppliers: [], groups: [] });
    setResolutions({ suppliers: {}, groups: {} });
    setAllSuppliers([]);
    setAllGroups([]);
    setCreateExpanded(null);
    fileRef.current = null;
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const hardErrorCount = rows.filter((r) => r.error?.type === "hard").length;
  const softMismatchCount = rows.filter((r) => r.error?.type === "soft").length;
  const hasHardErrors = hardErrorCount > 0;
  const hasSoftMismatches = softMismatchCount > 0;
  const resolvedCount =
    Object.keys(resolutions.suppliers).length + Object.keys(resolutions.groups).length;
  const totalUnknownCount = unknowns.suppliers.length + unknowns.groups.length;
  const allResolved = resolvedCount >= totalUnknownCount;

  const uploadDone = step !== "upload";
  const previewDone = step === "resolve" || step === "done";
  const resolveDone = step === "done";

  // ── Resolve step helpers ─────────────────────────────────────────────────

  function resolveUnknown(
    section: "suppliers" | "groups",
    csvValue: string,
    resolution: Resolution
  ) {
    setResolutions((prev) => ({
      ...prev,
      [section]: { ...prev[section], [csvValue]: resolution },
    }));
  }

  function unresolveUnknown(section: "suppliers" | "groups", csvValue: string) {
    setResolutions((prev) => {
      const { [csvValue]: _, ...rest } = prev[section];
      return { ...prev, [section]: rest };
    });
  }

  function renderUnknownCard(
    section: "suppliers" | "groups",
    items: UnknownValue[],
    allRecords: KnownRecord[],
    label: string
  ) {
    const sectionResolutions = resolutions[section];
    const unresolvedCount = items.length - Object.keys(sectionResolutions).length;

    return (
      <div className={styles.resolveCard}>
        <h3 className={styles.resolveCardTitle}>
          {label} · {unresolvedCount} unresolved
        </h3>
        {items.map((u) => {
          const resolved = sectionResolutions[u.csvValue];
          const isExpanded =
            createExpanded?.section === section && createExpanded.csvValue === u.csvValue;
          const suggestionRecord = u.suggestion
            ? allRecords.find((r) => r.name === u.suggestion)
            : null;

          return (
            <div key={u.csvValue} className={styles.mismatchRow}>
              <div>
                <span className={styles.csvValueChip}>{u.csvValue}</span>
                <div className={styles.rowCount}>
                  affects {u.rowCount} row{u.rowCount !== 1 ? "s" : ""}
                </div>
              </div>
              <div className={styles.resolutionOptions}>
                {resolved ? (
                  <div className={styles.resolvedChip}>
                    ✓ Will use &ldquo;
                    {resolved.type === "use_existing" ? resolved.displayName : resolved.name}
                    &rdquo; for all {u.rowCount} row{u.rowCount !== 1 ? "s" : ""}
                    <button
                      className={styles.undoLink}
                      onClick={() => unresolveUnknown(section, u.csvValue)}
                    >
                      undo
                    </button>
                  </div>
                ) : (
                  <>
                    {u.suggestion && suggestionRecord && (
                      <>
                        <div className={styles.suggestionChip}>
                          <span className={styles.suggestionLabel}>Suggestion</span>
                          Did you mean &ldquo;{u.suggestion}&rdquo;?
                          <button
                            className={styles.useSuggestionBtn}
                            onClick={() =>
                              resolveUnknown(section, u.csvValue, {
                                type: "use_existing",
                                id: suggestionRecord.id,
                                displayName: u.suggestion!,
                              })
                            }
                          >
                            Use {u.suggestion}
                          </button>
                        </div>
                        <div className={styles.orDivider}>or</div>
                      </>
                    )}
                    {isExpanded ? (
                      <div className={styles.createExpanded}>
                        <input
                          className={styles.createInput}
                          value={createExpanded.draft}
                          onChange={(e) =>
                            setCreateExpanded((prev) =>
                              prev ? { ...prev, draft: e.target.value } : null
                            )
                          }
                          autoFocus
                        />
                        <button
                          className={styles.confirmCreateBtn}
                          disabled={!createExpanded.draft.trim()}
                          onClick={() => {
                            resolveUnknown(section, u.csvValue, {
                              type: "create_new",
                              name: createExpanded.draft.trim(),
                            });
                            setCreateExpanded(null);
                          }}
                        >
                          Create {section === "suppliers" ? "supplier" : "group"}
                        </button>
                        <button
                          className={styles.cancelCreateLink}
                          onClick={() => setCreateExpanded(null)}
                        >
                          cancel
                        </button>
                      </div>
                    ) : (
                      <div className={styles.optionGroup}>
                        <select
                          className={styles.existingSelect}
                          value=""
                          onChange={(e) => {
                            const selected = allRecords.find((r) => r.id === e.target.value);
                            if (selected) {
                              resolveUnknown(section, u.csvValue, {
                                type: "use_existing",
                                id: selected.id,
                                displayName: selected.name,
                              });
                            }
                          }}
                        >
                          <option value="">
                            Pick an existing {section === "suppliers" ? "supplier" : "group"}…
                          </option>
                          {allRecords.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className={styles.createNewBtn}
                          onClick={() =>
                            setCreateExpanded({
                              section,
                              csvValue: u.csvValue,
                              draft: u.csvValue,
                            })
                          }
                        >
                          + Create new
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <Link href="/app/components" className={styles.back}>
        ← Back to Components
      </Link>
      <h1 className={styles.title}>Import Components from CSV</h1>

      {/* Step indicator — 4 steps */}
      <div className={styles.stepBar}>
        <div className={`${styles.stepItem} ${!uploadDone ? styles.stepActive : styles.stepDone}`}>
          <span className={styles.stepNum}>{uploadDone ? "✓" : "1"}</span>
          Upload
        </div>
        <div className={styles.stepConnector} />
        <div
          className={`${styles.stepItem} ${
            step === "preview" ? styles.stepActive : previewDone ? styles.stepDone : ""
          }`}
        >
          <span className={styles.stepNum}>{previewDone ? "✓" : "2"}</span>
          Preview
        </div>
        <div className={styles.stepConnector} />
        <div
          className={`${styles.stepItem} ${
            step === "resolve" ? styles.stepActive : resolveDone ? styles.stepDone : ""
          }`}
        >
          <span className={styles.stepNum}>{resolveDone ? "✓" : "3"}</span>
          Resolve
        </div>
        <div className={styles.stepConnector} />
        <div className={`${styles.stepItem} ${step === "done" ? styles.stepActive : ""}`}>
          <span className={styles.stepNum}>4</span>
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
            <span className={styles.dropSub}>or click to browse — .csv only, max 5 MB</span>
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
          {hasHardErrors && (
            <p className={styles.errorBanner}>
              ⚠️ <strong>{hardErrorCount} error{hardErrorCount !== 1 ? "s" : ""}</strong> found —
              fix your CSV and re-upload to proceed.
            </p>
          )}
          {!hasHardErrors && hasSoftMismatches && (
            <p className={styles.errorBanner} style={{ background: "var(--warning-dim, #fffbeb)", borderColor: "var(--warning)", color: "var(--warning)" }}>
              ⚠️ <strong>{softMismatchCount} value{softMismatchCount !== 1 ? "s" : ""}</strong> need
              resolution before you can import — click &ldquo;Next: Resolve&rdquo; below.
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
                {rows.map((row, idx) => (
                  <tr
                    key={`${row.rowIndex}-${idx}`}
                    className={
                      row.error?.type === "hard"
                        ? styles.rowError
                        : row.error?.type === "soft"
                        ? styles.rowWarning
                        : ""
                    }
                  >
                    <td>{row.rowIndex}</td>
                    <td>{row.raw["name"] || <em className={styles.missing}>—</em>}</td>
                    <td>{row.raw["sku"] || "—"}</td>
                    <td>{row.raw["unit"] || "—"}</td>
                    <td>{row.raw["cost_per_unit"] || "—"}</td>
                    <td>{row.raw["supplier_name"] || "—"}</td>
                    <td>
                      {row.error?.type === "hard" ? (
                        <span className={styles.errorLabel}>✗ {row.error.message}</span>
                      ) : row.error?.type === "soft" ? (
                        <span className={styles.warningLabel}>⚠ {row.error.message}</span>
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
            {rows.length} row{rows.length !== 1 ? "s" : ""} · {hardErrorCount} error
            {hardErrorCount !== 1 ? "s" : ""} · {softMismatchCount} needing resolution
          </p>

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={resetToUpload}>
              Re-upload CSV
            </button>

            {/* Hard errors → no primary action. Only soft mismatches → Resolve. Clean → Import. */}
            {!hasHardErrors && hasSoftMismatches && (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setStep("resolve")}
              >
                Next: Resolve →
              </button>
            )}
            {!hasHardErrors && !hasSoftMismatches && (
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={loading}
                onClick={handleImport}
              >
                {loading ? "Importing…" : `Import ${rows.length} Components`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Resolve step */}
      {step === "resolve" && (
        <div className={styles.resolveSection}>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--ink-muted)", margin: 0 }}>
            <strong style={{ color: "var(--ink-strong)" }}>
              {totalUnknownCount} value{totalUnknownCount !== 1 ? "s" : ""} from your CSV weren&rsquo;t recognised.
            </strong>{" "}
            Assign each one before importing — your choice applies to all rows with that value.
          </p>

          {unknowns.suppliers.length > 0 &&
            renderUnknownCard("suppliers", unknowns.suppliers, allSuppliers, "Suppliers")}

          {unknowns.groups.length > 0 &&
            renderUnknownCard("groups", unknowns.groups, allGroups, "Component Groups")}

          <div className={styles.resolveActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setStep("preview")}
            >
              ← Back to preview
            </button>
            <div className={styles.actions}>
              <span className={styles.resolveProgress}>
                {resolvedCount} of {totalUnknownCount} resolved
              </span>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!allResolved || loading}
                onClick={handleImport}
              >
                {loading ? "Importing…" : `Import ${rows.length} Components`}
              </button>
            </div>
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

- [ ] **Step 3: Confirm TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors in the changed files

- [ ] **Step 4: Run all CSV unit tests to confirm nothing regressed**

Run: `npx vitest run src/lib/csv/`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/app/components/import/page.tsx src/app/app/_ui/import-page.module.css
git commit -m "feat(csv): Resolve step for unknown suppliers/groups with fuzzy suggestions"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** fuzzy.ts ✓ · validate-components error type ✓ · dry-run unknowns + suggestions ✓ · allSuppliers/allGroups for dropdowns ✓ · commit resolutions ✓ · create_new supplier/group ✓ · Preview amber warnings ✓ · Resolve step ✓ · 4-step wizard bar ✓ · Import button disabled until all resolved ✓ · Locations stay hard fail ✓
- [x] **Placeholder scan:** No TBDs or TODOs — all steps have complete code
- [x] **Type consistency:** `Resolution` type is defined in page.tsx and stripped to the server-compatible shape before POST; `UnknownValue`, `KnownRecord`, `Resolutions` used consistently throughout; `RowError.field` set in validate-components.ts and read in the route
- [x] **Dependency order:** Task 1 (fuzzy.ts) → Task 2 (validate-components) → Task 3 (route) → Task 4 (UI) — each task builds on the previous without circular dependencies
