# Locations Manager — Design Spec

**Date:** 2026-05-06  
**Status:** Approved

---

## Overview

A managed location hierarchy for warehouse stock items, replacing the free-text `bin_sub_location`, `bin_row`, and `bin_bay` fields on `component` with proper FK-referenced entities. Each location entity gets a scannable barcode (Code 128, last 6 hex chars of UUID) for future Android stocktake-on-the-fly support.

The feature lives under a new **Warehouse** top-level nav section.

---

## Scope

**In scope:**
- Database schema for the location hierarchy
- Locations Manager page (`/app/warehouse/locations`) — CRUD for all levels
- Barcode modal + print label per entity
- Updated component bin location section (cascading dropdowns)
- Updated stocktake and inventory pages to resolve FK fields

**Out of scope (future):**
- Android app barcode scanning
- Barcode scanning in the web UI
- Bulk component location assignment
- Location-based picking or putaway workflows

---

## Location Hierarchy

Four levels, all optional except that **bay always requires an aisle**:

```
Warehouse
  └── Sub-location (optional, belongs to warehouse)
  └── Aisle (optional, belongs to warehouse; optionally tagged to a sub-location)
       └── Bay (optional, always belongs to an aisle)
```

Valid component assignments:
- No location
- Warehouse only
- Warehouse + Sub-location
- Warehouse + Aisle (with or without sub-location tag)
- Warehouse + Aisle + Bay (with or without sub-location tag on aisle)

---

## Data Model

### Existing table (no structural change)

```sql
-- location table remains the warehouse level
-- id, tenant_id, name, is_default, created_at already exist
```

### New tables

```sql
create table bin_sub_location (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  warehouse_id  uuid not null references location(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now()
);

create table bin_aisle (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenant(id) on delete cascade,
  warehouse_id     uuid not null references location(id) on delete cascade,
  sub_location_id  uuid references bin_sub_location(id) on delete set null,
  name             text not null,
  created_at       timestamptz not null default now()
);

create table bin_bay (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  aisle_id   uuid not null references bin_aisle(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
```

### Component table migration

Drop the three free-text fields and add FK references:

```sql
alter table component
  drop column bin_sub_location,
  drop column bin_row,
  drop column bin_bay,
  add column bin_sub_location_id uuid references bin_sub_location(id) on delete set null,
  add column bin_aisle_id        uuid references bin_aisle(id) on delete set null,
  add column bin_bay_id          uuid references bin_bay(id) on delete set null;
```

### Barcode value

The short location code is the **last 6 hex characters** of the entity's UUID, displayed uppercase (e.g. `1B3E`). No extra column — derived at query/display time via `right(id::text, 6)`. The full UUID is stored and used for all FK relationships; the short code is display/scan only.

### RLS

All new tables follow the existing tenant isolation pattern: `tenant_id = auth.jwt()->>'tenant_id'`.

---

## Navigation

New top-level nav section **Warehouse**:

```
/app/warehouse/locations   — Locations Manager
```

The nav entry appears alongside Components, Inventory, etc. Future warehouse ops (putaway, pick lists) would be added under this section.

---

## Locations Manager UI (`/app/warehouse/locations`)

A flat tree list showing the full warehouse hierarchy. Layout:

- **Warehouse row** (top, shaded): name, sub-location count, aisle count, buttons: ⊕ Sub-location, ⊕ Aisle, ▦ Barcode, ✎ Edit
- **Sub-location rows** (indented once): name, buttons: ▦ Barcode, ✎ Edit, ✕ Delete
- **Aisle rows** (indented once): name, optional "· Sub-location" tag, bay count, buttons: ⊕ Bay, ▦ Barcode, ✎ Edit, ✕ Delete
- **Bay rows** (indented twice): name, path breadcrumb, buttons: ▦ Barcode, ✎ Edit, ✕ Delete
- **Add Warehouse** CTA at the bottom (supports multi-warehouse for future)

**Add / Edit:** opens a small inline form or modal — name field only at every level. When adding an aisle, an optional sub-location dropdown appears.

**Delete rules:**
- Delete is blocked (with an explanatory message) if any components are assigned to that location or any of its children.
- Deleting an aisle cascades to its bays (DB cascade). User is warned before confirming.
- Deleting a warehouse is blocked if it has any children.

**Multi-warehouse:** For MVP, most tenants will have one warehouse. The UI shows all warehouses in the same flat tree. The ⊕ Add Warehouse button is always visible.

---

## Barcode Modal

Clicking **▦ Barcode** on any row opens a modal containing:

- Entity type label (e.g. "Bay Location")
- Entity name (e.g. "Bay 2")
- Full path breadcrumb (e.g. "Main Warehouse · Aisle 1 · Bay 2")
- Code 128 barcode rendered client-side via **JsBarcode**, encoding the 6-character short code
- Short code displayed in large monospace text below the barcode (e.g. `1B3E`)
- **🖨 Print Label** button — triggers `window.print()` with a `@media print` stylesheet
- **⬇ Download PNG** button — exports the barcode canvas as a PNG

### Physical label (~60×40mm)

```
[Tenant name]
[Parent path, small]
[Entity name, large bold]
[Code 128 barcode]
[6-char short code]
```

---

## Component Bin Location Section

Replaces the three free-text inputs on the component detail page with cascading dropdowns:

1. **Warehouse** — pre-selected if only one exists for the tenant
2. **Sub-location** — optional, shows all sub-locations for the selected warehouse. Selecting a sub-location narrows the aisle list to aisles tagged with that sub-location (but the user can clear the sub-location filter to see all aisles).
3. **Aisle** — optional, shows all aisles for the selected warehouse (filtered by sub-location if one is selected); aisles with a sub-location show "· Sub-location" suffix
4. **Bay** — optional, filters to bays in the selected aisle only; disabled if no aisle selected

`bin_sub_location_id` on component is independent of the `sub_location_id` tag on `bin_aisle`. A component may be assigned to "Mezzanine" without specifying an aisle (e.g. a rough location is known). Conversely, a component assigned to an aisle tagged "Mezzanine" does not automatically inherit a `bin_sub_location_id` — the sub-location field on the component form is set separately.

Clearing aisle also clears bay (enforces "bay requires aisle"). An assigned-location summary shows the full path and short code live as selections change.

The server action `updateBinLocation` is updated to accept the new FK IDs instead of text values.

---

## Affected Existing Pages

These pages currently read `bin_sub_location`, `bin_row`, `bin_bay` as text and must be updated to join the new tables and display the resolved names:

- `src/app/app/stocktake/[sessionId]/page.tsx` — grouping by bin location
- `src/app/app/stocktake/[sessionId]/counting-sheet.tsx` — bin group labels and print
- `src/app/api/stocktake/[sessionId]/export/route.ts` — CSV export columns
- `src/app/app/components/[componentId]/page.tsx` — bin location form section
- `src/app/app/components/actions.ts` — `updateBinLocation` server action

---

## Error Handling

- Delete blocked: show inline error "X components are assigned to this location. Reassign them before deleting."
- Cascade warning: when deleting an aisle with bays, confirm dialog lists the bays that will also be deleted.
- Duplicate name: names must be unique within their parent scope (e.g. two aisles in the same warehouse cannot share a name). DB unique constraint + user-facing validation message.
