# Components Feature Review

**Date:** 2026-05-28  
**Reviewer:** Claude (pre-launch audit)  
**Branch:** feat/super-admin-foundation  
**Scope:** Full components surface — list page, detail page (all 5 tabs), goods-inwards flow, purchasing module as it relates to components.

---

## Files Covered

| File | Role |
|------|------|
| `src/app/app/components/page.tsx` | Component list |
| `src/app/app/components/component-create-form.tsx` | Create dialog |
| `src/app/app/components/actions.ts` | Server actions |
| `src/app/app/components/helpers.ts` | Stock status logic |
| `src/app/app/components/[componentId]/page.tsx` | Detail page |
| `src/app/app/components/[componentId]/detail-tabs.tsx` | All 5 detail tabs + suppliers tab |
| `src/app/app/components/[componentId]/bin-location-select.tsx` | Location tab |
| `src/app/app/goods-inwards/page.tsx` | Receipt list |
| `src/app/app/goods-inwards/[id]/page.tsx` | Receipt detail |
| `src/app/app/goods-inwards/receipt-detail.tsx` | Receipt detail UI |
| `src/app/app/goods-inwards/receipt-list.tsx` | Receipt list UI |
| `src/app/app/goods-inwards/new/page.tsx` | New receipt form |
| `src/app/app/purchasing/page.tsx` | Purchase orders |
| `src/app/app/sidebar-nav.tsx` | Navigation |

---

## Scores

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Usefulness** | **7 / 10** | Core inventory data is solid — on-hand, available, reserved, in-prod, reorder point, stock value, and the supplier catalog with actual-vs-quoted lead time comparison are standout. Undermined by no edit, no delete, no quick-create-PO, and the purchasing module being unreachable from the nav. |
| **Accessibility** | **3 / 10** | Color-only stock status indicators, tabs without ARIA roles, stat cards with no label associations, dialog close with no `aria-label`. Underlying HTML is semantically reasonable (tables, proper `<label>`) but the interactive components fail. |
| **Ease of Use** | **6 / 10** | Low-stock filter with badge is intuitive; two-column detail layout is clean; alarm banner is prominent. But no edit workflow, broken BOM deep-links, "Receive Stock" loses context, and purchasing is a dead end for anyone who doesn't know to type the URL manually. |

---

## Findings

### 🔴 Broken / Missing Navigation

#### F-01 — Purchasing has no sidebar entry
- **File:** `src/app/app/sidebar-nav.tsx`
- **Detail:** The entire `/app/purchasing` route exists with a full UI but is absent from `buildNavSections()`. Users cannot navigate to it without typing the URL directly.
- **Impact:** High — the purchasing module is effectively invisible.

#### F-02 — Inventory page has no sidebar entry
- **File:** `src/app/app/sidebar-nav.tsx`
- **Detail:** `/app/inventory` (manual stock movements) exists and has an export route but is not in the sidebar nav.
- **Impact:** Medium — used for manual adjustments, currently unreachable.

#### F-03 — BOM Usage rows link to generic `/app/bom`
- **File:** `src/app/app/components/[componentId]/detail-tabs.tsx` line 232
- **Detail:** `<a href="/app/bom" className={styles.bomLink}>` — the `row.bomId` and product name are available in the row but the link goes to the generic BOM list. Users can't navigate directly to the specific BOM that uses this component.
- **Impact:** Medium — traceability from component → product is broken.

#### F-04 — "Receive Stock" button drops context
- **File:** `src/app/app/components/[componentId]/page.tsx` line 367
- **Detail:** `<Link href="/app/goods-inwards/new">` — navigates to the new receipt form with no `component_id` query param. Users arrive at a blank form with no connection back to the component they came from.
- **Impact:** Medium — creates friction in a high-frequency workflow.

#### F-05 — Movement ref type is not linked
- **File:** `src/app/app/components/[componentId]/detail-tabs.tsx` line 194
- **Detail:** The "Ref" column in the Movements tab renders the raw `reference_type` string (e.g., `production_order`, `goods_receipt`) but is not a clickable link. The referenced entity is unreachable from here.
- **Impact:** Low–Medium — important for audit purposes.

---

### 🟡 Missing Content

#### F-06 — No edit for component fields
- **File:** `src/app/app/components/actions.ts`
- **Detail:** Only `createComponent` and `updateBinLocation` exist as server actions. After a component is created, its name, SKU, unit of measure, cost per unit, reorder point, group, and primary supplier cannot be changed from any UI. The detail info card is entirely read-only.
- **Impact:** High — critical gap before launch.

#### F-07 — Component list has no page title
- **File:** `src/app/app/components/page.tsx` line 91
- **Detail:** `<PageHeader description={...} actions={...} />` — the `title` and `eyebrow` props are not passed. There is no visible `<h1>` heading on the page.
- **Impact:** Low — accessibility and orientation concern.

#### F-08 — No delete / archive for components
- **File:** `src/app/app/components/actions.ts`, `[componentId]/page.tsx`
- **Detail:** There is a trash feature in the app but no server action or UI to soft-delete a component. Components that are retired or entered in error cannot be removed.
- **Impact:** Medium — operational hygiene issue.

#### F-09 — Supplier links cannot be edited or removed
- **File:** `src/app/app/components/[componentId]/detail-tabs.tsx` line 274+
- **Detail:** In the Suppliers tab, a linked supplier entry can only have its "preferred" status toggled. The unit cost, lead time, MOQ, and part number cannot be updated, and the link cannot be deleted. Users must work around this by unlinking and re-adding.
- **Impact:** Medium.

#### F-10 — Location tab has no explanatory text
- **File:** `src/app/app/components/[componentId]/detail-tabs.tsx` line 253
- **Detail:** The Location tab (admin-only) opens directly into a bin-location selector with no description of what a bin location is or why it matters. Non-obvious to new admins.
- **Impact:** Low.

---

### 🔵 Accessibility

#### F-11 — Stat cards have no accessible label association
- **File:** `src/app/app/components/[componentId]/detail-tabs.tsx` lines 106–143
- **Detail:** Each stat card renders a large number (`statValue`) and a sibling `<span>` label (`statLabel`), but there is no `aria-labelledby` or `aria-label` connecting them. A screen reader announcing "32" has no context.
- **Impact:** Medium — WCAG 1.3.1 (Info and Relationships).

#### F-12 — Detail tabs have no ARIA tab role or state
- **File:** `src/app/app/components/[componentId]/detail-tabs.tsx` lines 89–102
- **Detail:** The tab bar renders `<button>` elements styled as tabs but without `role="tab"`, `aria-selected`, `aria-controls`, or a wrapping `role="tablist"`. Screen readers treat them as a row of unrelated buttons.
- **Impact:** Medium — WCAG 4.1.2 (Name, Role, Value).

#### F-13 — Dialog close button has no accessible label
- **File:** `src/app/app/components/component-create-form.tsx` line 61
- **Detail:** `<button type="button" className={styles.dialogClose} onClick={() => setOpen(false)}>&times;</button>` — the `×` glyph is not readable by screen readers. Missing `aria-label="Close"`.
- **Impact:** Low–Medium — WCAG 4.1.2.

#### F-14 — Stock status is communicated by color only
- **File:** `src/app/app/components/components.module.css`, `page.tsx` lines 161–170
- **Detail:** The colored dot (green/yellow/red) in the component name column is the only visual status indicator. There is no text alternative (`title`, `aria-label`, or hidden text) for users who are color-blind or using a screen reader.
- **Impact:** Medium — WCAG 1.4.1 (Use of Color).

---

### ⚪ Ease of Use

#### F-15 — Date format inconsistency
- **File:** `detail-tabs.tsx` line 277 vs `[componentId]/page.tsx` line 262
- **Detail:** The Movements tab formats dates using `en-GB` (DD/MM/YYYY). Recent receipts on the Overview tab use `en-AU` (D Mon YYYY). Both are Australian conventions but they look different in the same UI.
- **Impact:** Low.

#### F-16 — Aisle dropdown requires sub-location even when not applicable
- **File:** `src/app/app/components/[componentId]/bin-location-select.tsx` line 51
- **Detail:** `filteredAisles = slId ? aisles.filter(a => a.sub_location_id === slId) : []` — aisles that are not associated with any sub-location are completely unreachable through this selector. The Aisle field is also disabled (`disabled={!slId}`) until a sub-location is chosen.
- **Impact:** Medium — operators with flat warehouse hierarchies can't use this feature.

#### F-17 — Clicking "All" tab loses the active search query
- **File:** `src/app/app/components/page.tsx` line 97
- **Detail:** The "All" tab is `<a href="/app/components">` — navigating away drops `?q=...`. A user who has filtered to "Low Stock" and then wants to see all results for the same search term loses their query.
- **Impact:** Low.

#### F-18 — Ref type column shows raw database enum values
- **File:** `src/app/app/components/[componentId]/detail-tabs.tsx` line 196
- **Detail:** The Ref column in the Movements tab renders `m.reference_type` verbatim (e.g., `production_order`, `goods_receipt`, `manual_adjustment`). These are internal enum strings, not human-readable labels.
- **Impact:** Low.

#### F-19 — No sort controls on the component list
- **File:** `src/app/app/components/page.tsx`
- **Detail:** The list is sorted alphabetically by name only (server-side). There are no user-controlled sort options (e.g., by on-hand qty, available qty, stock status, or reorder point). Operators managing large catalogues can't surface the most critical items.
- **Impact:** Low–Medium.

---

## Easy Wins

> These are *additions* beyond fixing the findings — features that would add meaningful value with relatively small effort.

### EW-01 — "Order more" shortcut on the component detail page
**Effort:** XS | **Value:** High  
Add a second button to the `cardActions` section alongside "Receive Stock" that navigates to `/app/purchasing` pre-filled with this component and its preferred supplier. Closes the loop between identifying a low-stock component and raising a PO. One navigation link, no new server action needed.

### EW-02 — Inline reorder-point quick-edit on the list
**Effort:** S | **Value:** High  
Make the "Reorder Point" cell in the list table an inline click-to-edit number input, saving via a server action on blur/Enter. Operations teams tune these frequently; eliminating the drill-in-edit-back-out cycle saves many interactions per week.

### EW-03 — "Days remaining" on the Overview tab
**Effort:** S | **Value:** High  
Calculate `available / average daily consumption` from the existing movements data and surface it as a sixth stat card (e.g., "~12 days remaining at current usage"). Transforms a static snapshot into a forward-looking signal that drives purchasing decisions.

### EW-04 — Component group filter chips on the list
**Effort:** XS | **Value:** Medium  
The list page already fetches groups. Rendering them as one-click filter chips above the table (alongside the existing "All" / "Low Stock" tabs) would let teams with large catalogues narrow to a category instantly — no text required.

### EW-05 — Image or document attachment on the detail page
**Effort:** M | **Value:** Medium–High  
A single image or spec-sheet upload (Supabase Storage, one file per component) on the detail info card eliminates the most common "is this the right part?" ambiguity. Operators matching physical parts to records need a photo or datasheet. This is one of the most-requested features in any component catalogue product.
