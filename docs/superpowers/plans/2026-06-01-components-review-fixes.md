# Components Pre-Launch Review — Fix Report

**Branch:** `fix/components-review`  
**Merged:** 2026-06-01  
**Base plan:** `2026-06-01-components-review.md`  
**Spec:** `docs/superpowers/specs/2026-06-01-components-review-design.md`

All 19 findings from the components pre-launch review were resolved across 8 tasks and merged to `main`.

---

## Summary

| F# | Finding | Fix |
|----|---------|-----|
| F-01 | Purchasing missing from sidebar | Added Purchasing entry to Operations section |
| F-02 | Inventory missing from sidebar | Added Inventory entry to Operations section |
| F-03 | BOM links went to generic `/app/bom` | Links now resolve to `/app/products/variants/[variantId]` |
| F-04 | "Receive Stock" link had no context | Link now passes `?component_id=[id]`; goods-inwards form pre-selects the component |
| F-05 | Movement ref column was plain text | `goods_receipt` and `production_order` refs are now clickable links |
| F-06 | No way to edit a component after creation | Added Edit button (admin-only) with pre-filled modal for all 8 fields |
| F-07 | Component list had no page heading | Added `<PageHeader eyebrow="Inventory" title="Components" />` |
| F-08 | No way to archive a component | Added Archive button (admin-only) with 4-check conflict guard and confirmation step |
| F-09 | Supplier link fields were read-only | Added inline edit row and unlink confirmation per supplier row (admin-only) |
| F-10 | Location tab had no explanatory text | Added paragraph describing what the tab does and linking to Warehouse → Locations |
| F-11 | Stat card values had no accessible label | Added `id` to label spans; value spans use `aria-labelledby` |
| F-12 | Tab bar had no ARIA roles | Added `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"` |
| F-13 | Create dialog close button unlabelled | Added `aria-label="Close dialog"` to × button (create and edit modals) |
| F-14 | Status dots were colour-only | Added `<span class="srOnly">Critical / Low / OK</span>` inside each dot |
| F-15 | Movement dates used en-GB format | Switched to `en-AU` with `{ day: "numeric", month: "short", year: "numeric" }` |
| F-16 | Aisles couldn't be selected without a sub-location | Aisle filter now falls back to `sub_location_id IS NULL` rows instead of being disabled |
| F-17 | Search query was lost on tab switch | Tab links (All / Low Stock) now carry the current `q` param in their href |
| F-18 | Movement ref types showed raw enum values | Added `REF_TYPE_LABELS` map: `goods_receipt` → "Goods Receipt", etc. |
| F-19 | List table had no sort controls | Column headers (Name, On Hand, Available, Reorder Point) are now sort-toggle links with ▲/▼ indicators |

---

## Files Changed

### New files
- `supabase/patches/component_archive.sql` — adds `archived_at timestamptz` column
- `src/app/app/components/component-edit-form.tsx` — Edit modal client component
- `src/app/app/components/[componentId]/archive-button.tsx` — Archive button with 3-phase dialog state machine

### Modified files
| File | Changes |
|------|---------|
| `src/app/app/sidebar-nav.tsx` | Added Purchasing + Inventory entries (F-01, F-02) |
| `src/app/app/components/page.tsx` | Page heading, archived_at filter, search preservation, sort controls, sr-only dots (F-07, F-14, F-17, F-19 + archive filter) |
| `src/app/app/components/components.module.css` | `.srOnly`, `.sortHeader` utility classes |
| `src/app/app/components/actions.ts` | `updateComponent`, `archiveComponent`, `updateComponentSupplier` server actions |
| `src/app/app/components/component-create-form.tsx` | `aria-label` on close button (F-13) |
| `src/app/app/components/[componentId]/page.tsx` | Extended select fields, BOM + movement queries, `bomRows`/`movementRows` mapping, en-AU dates, ComponentEditForm + ArchiveButton render (F-03–F-06, F-08, F-15) |
| `src/app/app/components/[componentId]/detail-tabs.tsx` | BOM links, ref links + labels, location copy, ARIA roles, stat card labels, supplier edit/unlink UI (F-03, F-05, F-09–F-12, F-18) |
| `src/app/app/components/[componentId]/bin-location-select.tsx` | Aisle filter fallback for null sub-location (F-16) |
| `src/app/app/components/[componentId]/component-detail.module.css` | Archive overlay, supplier edit row, icon button, refLink styles |
| `src/app/app/goods-inwards/new/page.tsx` | Accepts `component_id` search param; passes `initialComponentId` to ReceiptForm (F-04) |
| `src/app/app/goods-inwards/receipt-form.tsx` | Accepts `initialComponentId`; pre-populates first line (F-04) |

---

## Server Actions Added

| Action | Purpose |
|--------|---------|
| `updateComponent(componentId, prevState, formData)` | Edit name, SKU, unit, group, supplier, cost, reorder point, low stock level. Role-guarded; logs activity; revalidates component + list + activity-log. |
| `archiveComponent(componentId)` | Sets `archived_at`. Runs 4 parallel conflict checks (active BOMs via two-step query, on-hand stock, open POs, open order allocations) before proceeding. Returns discriminated union `{ success: true } \| { error, conflicts }`. |
| `updateComponentSupplier(prevState, formData)` | Updates `supplier_components` row fields (unit cost, lead time, MOQ, part number). Role-guarded; logs activity. |

---

## Notable Implementation Details

**Archive conflict check — two-step BOM query.** Supabase PostgREST doesn't support filtering on embedded resource fields (`.eq("product_bom.is_active", true)` silently returns all rows). The fix fetches `product_bom_component` rows for the component first, then queries `product_bom` with `.in("id", bomIds).eq("is_active", true)`.

**Goods-inwards merge.** The main branch added PO pre-selection to the new receipt form at the same time this branch added component pre-selection. Both features were merged cleanly: `receipt-form.tsx` now accepts `availablePOs`, `initialPoId`, and `initialComponentId`; the lines initialiser checks `initialPo` first, then falls back to `initialComponentId`.

**Supplier edit stale state.** Extracting `SupplierEditForm` into its own component ensures each row gets a fresh `useActionState` on mount, preventing stale success/error state from bleeding across rows.
