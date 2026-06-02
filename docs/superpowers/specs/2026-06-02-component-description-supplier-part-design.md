# Component Description & Supplier Part Number Entry Design

**Date:** 2026-06-02  
**Status:** Approved  
**Scope:** Add `description` field to components; surface `supplier_part_number` during component creation and CSV import; always create a `supplier_components` row when a supplier is selected at creation time.

---

## 1. Overview

Two new fields become first-class citizens of component creation and import:

1. **Description** (`component.description text`) — free-text description of the component, optional. Surfaced on the create form, edit form, detail page, and CSV import.
2. **Supplier Part Number** (`supplier_components.supplier_part_number`) — the supplier's catalog reference for this component. Already stored in the `supplier_components` table; now also captured at creation/import time.

**Behavioural change:** When a component is created with a supplier (form or CSV), a `supplier_components` row is upserted with `is_preferred = true`. Previously no `supplier_components` row was created at all — supplier was only recorded on `component.supplier_id`.

---

## 2. Database

New patch file: `supabase/patches/component_description_and_supplier_part.sql`

```sql
alter table public.component
  add column if not exists description text;
```

No schema change is needed for `supplier_components` — `supplier_part_number text` already exists on that table.

---

## 3. Server Action: `createComponent`

**File:** `src/app/app/components/actions.ts`

**New fields read from `formData`:**
- `description` (optional string, trimmed, stored as null if empty)
- `supplier_part_number` (optional string, trimmed, stored as null if empty)

**Changes to component insert:** add `description` to the insert payload.

**New step after component insert:** if `supplier_id` is set, upsert into `supplier_components`:

```sql
insert into public.supplier_components
  (tenant_id, supplier_id, component_id, supplier_part_number, is_preferred)
values (...)
on conflict (tenant_id, supplier_id, component_id)
do update set
  supplier_part_number = excluded.supplier_part_number,
  is_preferred = true
```

Only `supplier_part_number` and `is_preferred` are touched on conflict — existing `unit_cost`, `lead_time_days`, and `moq` are preserved.

If `supplier_id` is not set, skip the upsert entirely.

---

## 4. Component Create Form

**File:** `src/app/app/components/component-create-form.tsx`

**New fields:**
- **Description** — `<textarea name="description">`, optional, no character limit. Position: below Name, above SKU. Label: "Description".
- **Supplier Part Number** — `<input type="text" name="supplier_part_number">`, optional. Position: below the Supplier dropdown. Only rendered when a supplier is selected (`useState` on the supplier `<select>` onChange). Label: "Supplier Part Number". Placeholder: "e.g. RC0402FR-0710KL".

---

## 5. Component Edit Form

**File:** `src/app/app/components/component-edit-form.tsx`

**New field:**
- **Description** — same textarea as the create form, pre-populated with the current `description` value. Position: below Name, above SKU.

The `updateComponent` server action in `actions.ts` must also be updated to read and save `description`.

**Note:** Supplier Part Number is not in the edit form. It is already editable via the Suppliers tab on the component detail page (`updateComponentSupplier` action).

---

## 6. Component Detail Page

**File:** `src/app/app/components/[componentId]/page.tsx`

**Changes:**
- Add `description: string | null` to the `ComponentRecord` type
- Add `description` to the Supabase select string
- Render `description` in the info card: inside the right-hand column of the `imageRow` div (below the SKU badge and alarm banner, above the meta grid). Only rendered when non-null. Use `--ink-muted` colour and `--fs-sm` size, no label needed.

---

## 7. CSV Import

**File:** `src/app/api/import/components/route.ts` and `src/app/app/components/import/page.tsx`

### Template download

Updated column order:
```
name, sku, unit, cost_per_unit, reorder_point, low_stock_level, supplier_name, supplier_part_number, location_name, group_name, description
```

The example row becomes:
```
Safety Laser Scanner,CMP-001,ea,142.00,10,5,Omron,F3SG-4RA0960P14,Warehouse A,Electronics,Compact safety laser scanner for machine guarding
```

### Dry-run phase

Read `supplier_part_number` and `description` from each row. Both are optional free-text — no lookup or validation required.

### Commit phase

1. Include `description` in each component insert row (as before with other fields).
2. After bulk-inserting all components, collect rows where `supplier_id` was resolved (non-null). For those rows, bulk upsert into `supplier_components`:
   - Fields: `tenant_id`, `supplier_id`, `component_id`, `supplier_part_number`, `is_preferred = true`
   - Conflict target: `(tenant_id, supplier_id, component_id)`
   - On conflict: update `supplier_part_number`, `is_preferred = true` only

---

## 8. Error Handling

| Scenario | Behaviour |
|---|---|
| `supplier_part_number` provided but no supplier selected | Field ignored silently (no supplier = no `supplier_components` row) |
| `supplier_components` upsert fails (DB error) | Log error, do not fail the component creation — component is still created successfully |
| CSV row has `supplier_part_number` but `supplier_name` is blank or unresolved | Part number ignored; component inserted without `supplier_components` row |
| `description` is empty string | Stored as `null` |

---

## 9. Out of Scope

- Editing `supplier_part_number` via the create/edit flow after creation — already handled by the Suppliers tab
- Adding `description` to the components list table — future pass
- Adding `description` to CSV export — future pass
