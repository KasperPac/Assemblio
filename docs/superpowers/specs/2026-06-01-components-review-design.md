# Components Feature — Pre-Launch Review Fixes

**Date:** 2026-06-01  
**Source review:** `docs/review/components/review.md`  
**Scope:** All 19 findings (F-01–F-19). Easy wins (EW-01–EW-05) deferred.  
**Delivery:** Single PR on `main`.

---

## Overview

The components feature has a solid data model and read-only detail view but is missing edit/archive workflows, has broken navigation, and has accessibility and UX gaps. This spec covers all 19 findings from the pre-launch audit, organised into 5 independent work streams.

---

## Stream 1 — Navigation Fixes (F-01–F-05)

### F-01 — Add Purchasing to sidebar
**File:** `src/app/app/sidebar-nav.tsx`  
Add a **Purchasing** entry to the Operations section of `buildNavSections()`. Icon: `ShoppingCart` (or nearest match in the icon set). Active state: `startsWith("/app/purchasing")`. No role gate — the route is already accessible to all roles.

### F-02 — Add Inventory to sidebar
**File:** `src/app/app/sidebar-nav.tsx`  
Add an **Inventory** entry to the Operations section. Icon: `Package` (or nearest match). Active state: `startsWith("/app/inventory")`. No role gate.

### F-03 — Fix BOM deep-links
**File:** `src/app/app/components/[componentId]/detail-tabs.tsx` line ~232  
Replace the static `href="/app/bom"` with a resolved path using `row.bomId` and `row.productId`. Verify the correct BOM detail route during implementation (likely `/app/products/[productId]/bom` or similar). Both `bomId` and the product name are already present on the row object.

### F-04 — Preserve context on "Receive Stock"
**File:** `src/app/app/components/[componentId]/page.tsx` line ~367  
Change the "Receive Stock" link from `/app/goods-inwards/new` to `/app/goods-inwards/new?component_id=[componentId]`. The goods-inwards new form should read this param and pre-select the component on arrival.

### F-05 — Link movement ref types
**File:** `src/app/app/components/[componentId]/detail-tabs.tsx` line ~194  
The Ref column in the Movements tab renders the raw `reference_type` string. Make it a link when a `reference_id` is available, mapping each type to its route:

| `reference_type` | Route |
|-----------------|-------|
| `goods_receipt` | `/app/goods-inwards/[reference_id]` |
| `production_order` | `/app/orders/[reference_id]` |
| `manual_adjustment` | No link (no detail page) |
| `stocktake` | `/app/stocktake/[reference_id]` (verify during implementation) |

The `reference_id` column already exists on movement rows.

---

## Stream 2 — CRUD Completion (F-06, F-08, F-09)

### F-06 — Edit component modal

**New file:** `src/app/app/components/component-edit-form.tsx`  
Client component mirroring the structure of `component-create-form.tsx`. Uses `useActionState`. Pre-populated from the component's current values passed as props.

**Fields:** name (required), SKU, unit of measure, group, primary supplier, cost per unit, reorder point, low stock level.

**Trigger:** An **Edit** button (pencil icon, admin-only) in the info card header on the detail page (`[componentId]/page.tsx`).

**New server action:** `updateComponent(componentId, formData)` in `actions.ts`  
- Role check: `admin | super_admin`
- Validate required fields
- Update the component row in Supabase
- Insert to `activity_log` with `event: "component.updated"` and `metadata: { before, after }`
- `revalidatePath("/app/components/[componentId]")`
- Return `{ success }` or `{ error }`

The modal auto-closes on success. The edit modal also gets the `aria-label="Close dialog"` fix from F-13.

### F-08 — Archive component

**New server action:** `archiveComponent(componentId)` in `actions.ts`  
- Role check: `admin | super_admin`
- Run four conflict checks (parallel queries):
  1. Active BOM lines: `bom_lines WHERE component_id = ? AND bom.status != 'archived'`
  2. Open production orders: `production_order_lines WHERE component_id = ? AND order.status IN ('pending','in_progress')`
  3. Open purchase orders: `purchase_order_lines WHERE component_id = ? AND po.status IN ('draft','sent','partial')`
  4. On-hand stock: `inventory_balances WHERE component_id = ? AND on_hand > 0`
- If any conflict: return `{ error: "Cannot archive", conflicts: string[] }` — the UI shows a blocking error dialog listing each conflict. No archive occurs.
- If clear: set `archived_at = now()` on the component record. Log `activity_log` with `event: "component.archived"`. Redirect to `/app/components`.

**UI:** An **Archive** button (admin-only, destructive styling) in the detail page header alongside Edit. Flow:
1. Click Archive → show confirmation dialog ("Are you sure you want to archive [name]? This cannot be undone from this screen.")
2. Confirm → call server action
3. Conflicts returned → replace confirmation dialog body with conflict list (no close = no accidental archive)
4. No conflicts → archive succeeds, redirect to list

Archived components are excluded from all lists, search results, and dropdowns by default (filter on `archived_at IS NULL`). Restoration is handled via the existing Trash section — the confirmation dialog copy should read "This can be undone from Trash." rather than implying permanence.

### F-09 — Supplier link editing

**New server actions in `actions.ts`:**

`updateComponentSupplier(componentSupplierId, formData)`
- Fields: `unit_cost`, `lead_time_days`, `moq`, `part_number`
- Role check: `admin | super_admin`
- Update `component_suppliers` row
- Log activity: `event: "component_supplier.updated"`, `metadata: { before, after }`
- `revalidatePath`

`removeComponentSupplier(componentSupplierId)`
- Role check: `admin | super_admin`
- Delete `component_suppliers` row
- Log activity: `event: "component_supplier.removed"`
- `revalidatePath`

**UI changes in `detail-tabs.tsx` (Suppliers tab):**  
Each supplier row gains two icon buttons (admin-only):
- **Edit (pencil):** Expands an inline edit form row beneath the supplier entry, pre-filled with current values. Save/Cancel buttons. Uses `updateComponentSupplier`.
- **Unlink (×):** Shows an inline confirmation ("Remove this supplier link?") before calling `removeComponentSupplier`.

Only one supplier row can be in edit mode at a time. Clicking Edit on another row while one is open closes the first without saving.

---

## Stream 3 — Missing Content (F-07, F-10)

### F-07 — Page title
**File:** `src/app/app/components/page.tsx`  
Add `title="Components"` and `eyebrow="Inventory"` to the `<PageHeader>` component. One-line change.

### F-10 — Location tab copy
**File:** `src/app/app/components/[componentId]/detail-tabs.tsx` (Location tab)  
Add a short paragraph above the `<BinLocationSelect>` component:
> "Assign a default storage location for this component. When stock is received, it will be directed to this bin. Locations are managed in [Warehouse → Locations](/app/locations)."

The link uses Next.js `<Link>` (not `<a>`).

---

## Stream 4 — Accessibility (F-11–F-14)

### F-11 — Stat card label association
**File:** `src/app/app/components/[componentId]/detail-tabs.tsx` lines ~106–143  
Each stat card gets a wrapper `<div>`. The label `<span>` receives a unique `id` (e.g. `id="stat-label-on-hand"`). The value element receives `aria-labelledby` pointing to that id. Screen readers announce "[value] — [label]" instead of a bare number.

### F-12 — Tab ARIA roles
**File:** `src/app/app/components/[componentId]/detail-tabs.tsx` lines ~89–102  
- Tab bar wrapper: add `role="tablist"`
- Each tab `<button>`: add `role="tab"`, `aria-selected={activeTab === tab.id}`, `aria-controls={\`panel-${tab.id}\`}`
- Each tab panel container: add `role="tabpanel"`, `id={\`panel-${tab.id}\`}`, `aria-labelledby={\`tab-${tab.id}\`}`
- Each tab `<button>`: also add `id={\`tab-${tab.id}\`}`

### F-13 — Dialog close button label
**Files:** `src/app/app/components/component-create-form.tsx` line ~61, and the new `component-edit-form.tsx`  
Replace the `&times;` text node with a proper SVG × icon (or keep the character but add `aria-hidden="true"`) and add `aria-label="Close dialog"` to the button element.

### F-14 — Color-only stock status
**Files:** `src/app/app/components/page.tsx` lines ~161–170  
Add a visually-hidden `<span className="sr-only">` inside each status dot element containing the status text: `"Critical"`, `"Low"`, or `"OK"`. The colored dot remains for sighted users — no visual change. Add the `sr-only` utility class to the CSS module if not already present:
```css
.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

---

## Stream 5 — UX Polish (F-15–F-19)

### F-15 — Date format consistency
**File:** `src/app/app/components/[componentId]/detail-tabs.tsx` line ~277  
The Movements tab uses `en-GB` locale (DD/MM/YYYY). Change to `en-AU` with options `{ day: 'numeric', month: 'short', year: 'numeric' }` to match the Overview tab's "3 Jun 2026" format.

### F-16 — Aisle dropdown bug
**File:** `src/app/app/components/[componentId]/bin-location-select.tsx` line ~51  
Current behaviour: `filteredAisles = slId ? aisles.filter(a => a.sub_location_id === slId) : []`  
Fixed behaviour: when `slId` is null/undefined, show aisles that have no `sub_location_id` (top-level aisles). When `slId` is set, filter to aisles belonging to that sub-location. The `disabled={!slId}` constraint on the Aisle field is also removed — it should only be disabled when there are no aisles to show.

```ts
filteredAisles = slId
  ? aisles.filter(a => a.sub_location_id === slId)
  : aisles.filter(a => a.sub_location_id === null)
```

### F-17 — Preserve search on tab switch
**File:** `src/app/app/components/page.tsx` line ~97  
The "All" tab and "Low Stock" tab links are built from the current `searchParams`. Update both to include the active `q` param:
- All: `href={q ? \`/app/components?q=${q}\` : '/app/components'}`
- Low Stock: `href={q ? \`/app/components?filter=low-stock&q=${q}\` : '/app/components?filter=low-stock'}`

### F-18 — Human-readable movement ref types
**File:** `src/app/app/components/[componentId]/detail-tabs.tsx` line ~196  
Add a lookup map (can live at the top of the file or in `helpers.ts`):
```ts
const REF_TYPE_LABELS: Record<string, string> = {
  production_order: 'Production Order',
  goods_receipt: 'Goods Receipt',
  manual_adjustment: 'Manual Adjustment',
  stocktake: 'Stocktake',
}
```
Render: `REF_TYPE_LABELS[m.reference_type] ?? m.reference_type`

### F-19 — Sort controls on component list
**File:** `src/app/app/components/page.tsx`  
Sort state lives in URL params (`?sort=name&dir=asc`). The page reads `searchParams.sort` and `searchParams.dir` and applies them to the Supabase query via `.order()`.

**Sortable columns:** Name, On Hand, Available, Reorder Point.  
**Default:** `name asc` (preserves current behaviour).  
**UI:** Column headers for sortable columns are rendered as `<a>` links that toggle direction (clicking an active-sorted column flips `asc`/`dir`, clicking a new column sets it `asc`). Active column shows a ▲ or ▼ chevron. Sort params are preserved alongside any active `?q=` and `?filter=` params.

---

## Data / Schema Notes

- **Archive:** Assumes a nullable `archived_at timestamptz` column on the `components` table (or `is_archived boolean`). Verify which exists; add a migration if neither is present.
- **Movement links:** Assumes `reference_id uuid` column on the movements/inventory_log table. Verify column name during implementation.
- **Supplier link edit:** The `component_suppliers` table is assumed to have `unit_cost`, `lead_time_days`, `moq`, `part_number` columns. Verify during implementation.

---

## Files Changed

| File | Change type |
|------|-------------|
| `src/app/app/sidebar-nav.tsx` | Add Purchasing + Inventory entries |
| `src/app/app/components/page.tsx` | Page title, tab links with q-param, sort controls |
| `src/app/app/components/actions.ts` | Add `updateComponent`, `archiveComponent`, `updateComponentSupplier`, `removeComponentSupplier` |
| `src/app/app/components/component-create-form.tsx` | Fix close button aria-label |
| `src/app/app/components/component-edit-form.tsx` | **New** — edit modal component |
| `src/app/app/components/[componentId]/page.tsx` | Edit + Archive buttons, Receive Stock link fix |
| `src/app/app/components/[componentId]/detail-tabs.tsx` | Tab ARIA, stat card labels, BOM links, movement links + labels, supplier edit/unlink, location tab copy, date format, ref type labels |
| `src/app/app/components/[componentId]/bin-location-select.tsx` | Fix aisle filter logic |
| `src/app/app/goods-inwards/new/page.tsx` | Read `component_id` query param and pre-select |

---

## Verification

Each finding has a clear "done" signal:

| Finding | Verify by |
|---------|-----------|
| F-01, F-02 | Purchasing and Inventory visible in sidebar without typing URL |
| F-03 | BOM row links navigate to the correct product BOM, not generic `/app/bom` |
| F-04 | Receive Stock pre-selects the component on arrival at the new receipt form |
| F-05 | Goods receipt and production order ref types in Movements are clickable links |
| F-06 | Edit button appears (admin only), form pre-fills, save updates the component |
| F-07 | List page has a visible `<h1>` heading "Components" |
| F-08 | Archive blocked when conflicts exist; succeeds and redirects when clear |
| F-09 | Supplier link fields editable inline; unlink removes the row |
| F-10 | Location tab shows explanatory copy above the bin selector |
| F-11 | Screen reader announces "[value] — [label]" for each stat card |
| F-12 | Tab widget passes axe/WAVE audit for role, aria-selected, aria-controls |
| F-13 | Create and edit dialog close buttons have `aria-label="Close dialog"` |
| F-14 | Status dot has sr-only text; colour-blind simulation still readable |
| F-15 | Movements tab dates show "3 Jun 2026" format, matching Overview tab |
| F-16 | Aisles without a sub-location are selectable in the bin location selector |
| F-17 | Active search query survives switching between All and Low Stock tabs |
| F-18 | Movements Ref Type column shows "Goods Receipt" not `goods_receipt` |
| F-19 | Column headers are clickable; URL updates with sort params; order changes |

---

## Out of Scope

- Easy wins EW-01–EW-05 (deferred)
- Goods-inwards PO linking UI (covered in goods-inwards review)
- Any database migrations beyond verifying existing columns
