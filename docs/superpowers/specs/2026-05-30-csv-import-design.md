# CSV Import — Design Spec
**Date:** 2026-05-30  
**Scope:** Components + Suppliers (BOMs deferred — separate session required, especially for labor cost integration)  
**Status:** Approved

---

## Overview

Bulk-create Components and Suppliers from CSV files during initial account setup. Users upload a CSV, see a full preview with inline validation errors, and confirm the import. Any errors block the entire import — no partial commits.

---

## UX Approach

Dedicated import sub-pages (not modals):

- `/app/components/import` — Components import
- `/app/suppliers/import` — Suppliers import

Each page has a **3-step flow**:

1. **Upload** — File drop zone + "Download template" link showing exact column format
2. **Preview** — Full-page scrollable table; each row shows OK or an inline error message; "Import N records" button is disabled while any errors exist; "Re-upload CSV" button lets user fix and restart
3. **Done** — Success count + "View [Entity]" button + "Import another file" button

**Navigation entry points:**
- "Import CSV" link added to the `actions` slot of `PageHeader` on `/app/components` and `/app/suppliers`, alongside the existing "+ Add" button.
- "← Back to [Entity]" link at top of each import page.

**Recommended import order for initial setup:**
1. Suppliers (no external dependencies)
2. Components (references supplier names)

---

## CSV Schemas

### Components
```
name, sku, unit, cost_per_unit, reorder_point, low_stock_level, supplier_name, location_name, group_name
```

| Column | Required | Notes |
|---|---|---|
| `name` | ✅ Yes | Free text |
| `sku` | No | Must be unique within the file and not already exist in the DB |
| `unit` | No | Free text (e.g. `ea`, `kg`) |
| `cost_per_unit` | No | Non-negative decimal |
| `reorder_point` | No | Non-negative integer |
| `low_stock_level` | No | Non-negative integer |
| `supplier_name` | No | Case-insensitive name lookup against `suppliers` table — not found → error |
| `location_name` | No | Case-insensitive name lookup against `location` table — not found → error |
| `group_name` | No | Case-insensitive name lookup against `component_group` table — not found → error |

### Suppliers
```
name, website, default_lead_time_days, contact_name, contact_email, contact_phone, address, payment_terms, default_currency
```

| Column | Required | Notes |
|---|---|---|
| `name` | ✅ Yes | Must be unique within the file and not already exist in the DB |
| `website` | No | Free text |
| `default_lead_time_days` | No | Non-negative integer |
| `contact_name` | No | Free text |
| `contact_email` | No | Free text |
| `contact_phone` | No | Free text |
| `address` | No | Free text |
| `payment_terms` | No | Free text |
| `default_currency` | No | Free text (e.g. `AUD`, `USD`) |

---

## Architecture

### Shared utility
`src/lib/csv/parse.ts` — extract `parseCSV` and `parseCSVLine` from the existing stocktake import route (`src/app/api/stocktake/[sessionId]/import/route.ts`) into a shared module.

### API Routes

```
POST /api/import/components
POST /api/import/suppliers
```

Both routes accept `multipart/form-data` with:
- `file` — the CSV file
- `dry_run` — `"true"` or `"false"`

**`dry_run: true`** (preview):
- Parse CSV
- Run all file-level and row-level validation (including DB lookups)
- Return `{ rows: Array<{ rowIndex: number; data: object; error?: string }> }`

**`dry_run: false`** (commit):
- Parse and validate again (server must not trust the client's validation result)
- If any error exists, return `{ error: "Validation failed" }` with status 400
- If all valid, insert all rows in a single batch
- Insert activity log entry
- Return `{ imported: N }`

### Import Pages

`src/app/app/components/import/page.tsx` and `src/app/app/suppliers/import/page.tsx` — both are `"use client"` components managing local state:

```
type Step = "upload" | "preview" | "done"
type PreviewRow = { rowIndex: number; data: Record<string, string>; error?: string }
```

State transitions:
- `upload` → user selects file → POST with `dry_run: true` → `preview`
- `preview` (errors) → user clicks "Re-upload CSV" → `upload`
- `preview` (no errors) → user clicks "Import N records" → POST with `dry_run: false` → `done`
- `done` → "View [Entity]" → navigate to list page

**Template download:** Generated client-side as a `Blob` with the header row and one example row — no API route required.

---

## Validation Rules

### File-level (checked first)
1. File must be `.csv`, max 5 MB
2. Must have at least one data row after the header
3. Header row must contain all required columns for the entity type (extra columns are silently ignored)

### Row-level — Components (first error per row wins)
1. `name` is blank → `"Name is required"`
2. `sku` is non-empty and duplicated within the CSV → `"Duplicate SKU in file"`
3. `sku` is non-empty and already exists in the DB for this tenant → `"SKU already exists"`
4. `cost_per_unit` is non-empty and not a non-negative number → `"cost_per_unit must be a non-negative number"`
5. `reorder_point` is non-empty and not a non-negative integer → `"reorder_point must be a non-negative integer"`
6. `low_stock_level` is non-empty and not a non-negative integer → `"low_stock_level must be a non-negative integer"`
7. `supplier_name` is non-empty and no matching supplier found (case-insensitive) → `"Supplier not found: [name]"`
8. `location_name` is non-empty and no matching location found (case-insensitive) → `"Location not found: [name]"`
9. `group_name` is non-empty and no matching group found (case-insensitive) → `"Group not found: [name]"`

### Row-level — Suppliers (first error per row wins)
1. `name` is blank → `"Name is required"`
2. `name` is duplicated within the CSV (case-insensitive) → `"Duplicate name in file"`
3. `name` already exists in the DB for this tenant (case-insensitive) → `"Supplier already exists"`
4. `default_lead_time_days` is non-empty and not a non-negative integer → `"default_lead_time_days must be a non-negative integer"`

---

## Activity Logging

On successful commit, insert one row into `activity_log`:

```ts
// Components
{ event: "components_csv_imported", metadata: { count: N } }

// Suppliers
{ event: "suppliers_csv_imported", metadata: { count: N } }
```

---

## Out of Scope

- BOMs import (deferred — separate session, needs labor cost design)
- Updating existing records (import is insert-only; duplicate SKU/name is an error)
- Partial imports (all-or-nothing)
- Progress indicators for very large files (5 MB / ~10,000 rows is the limit)
