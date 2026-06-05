# Findability & Inline-Edit Audit — Findings

**Date:** 2026-06-04
**Method:** see `2026-06-04-findability-edit-audit.md`
**Coverage:** all `/app` routes, 6 clusters, read-only sweep
**Total findings:** 109 (Products 14 · Ops-A 33 · Ops-B 14 · Logistics 14 · Orders+Dash 18 · Admin 16)

Categories: **Nav dead-end** · **Inline-edit** · **Findability** · **A11y**.
Each finding cites `file:line`. Impact = how much it hurts daily use; Effort = S/M/L.

---

## 1. Quick wins — High impact × Small effort

Draw the first fix batch from here. All are single-file or near-single-file changes.

| ID | Location | Category | Pain | Fix |
|----|----------|----------|------|-----|
| LOG-01 | suppliers/[supplierId]/supplier-tabs.tsx:460 | Nav dead-end | Supplied component name is plain `<span>`; can't reach the component (your original example) | Wrap in `<Link href={/app/components/${row.component.id}}>` — id already loaded |
| OPSA-08 | goods-inwards/receipt-list.tsx:262-265 | Nav dead-end | Linked PO shown as plain text `PO {id}` though it's a `<Link>` in the Due-In tab right above | Wrap in `<Link href={/app/purchasing/${r.purchase_order_id}}>` |
| OPSA-11 | goods-inwards/receipt-detail.tsx:474 | Nav dead-end | Receipt-line component name plain text; `component_id` already loaded | Wrap name in `<Link href={/app/components/${line.component_id}}>` |
| OPSA-20 | inventory/page.tsx:187-191 | Nav dead-end | Inventory balance component name plain text — can't jump to the component you're low on | Select `component:component_id(id,…)` and wrap in `<Link>` |
| ADM-07 | settings/settings-sidebar.tsx:12-18 | Findability | Order-settings page (SLA lead-times) exists but isn't in the settings sidebar — URL-only | Add `{ href:"/app/settings/orders", label:"Orders" }` to `workspaceLinks` |

**High-value next (High impact × Medium effort)** — schedule right after the quick wins:

| ID | Location | Category | Pain |
|----|----------|----------|------|
| OPSB-01 | departments/page.tsx:140-181 | Inline-edit | Admin/electricity/gas/overhead rates forced to hidden `0` inputs — 4 of 5 cost rates uneditable anywhere |
| LOG-02 | suppliers/[supplierId]/supplier-tabs.tsx:466-467 | Inline-edit | Base `unit_cost`/part#/MOQ/lead-time read-only; must unlink+relink to change (your original example) |
| ADM-10 | super-admin/tenants/[tenantId]/members-panel.tsx:108-110 | Inline-edit | Add-member requires hand-pasting a raw `auth.users.id` UUID — undiscoverable from UI |

---

## 2. Findings by cluster

### Products (PROD)

| ID | Location (file:line) | Category | Pain | Fix | Imp | Eff | Browser |
|----|------|----------|------|-----|-----|-----|---------|
| PROD-01 | components/[componentId]/detail-tabs.tsx:459 | Nav dead-end | Supplier name in Suppliers tab plain `<span>` though `supplierId` exists | `<Link href={/app/suppliers/${row.supplierId}}>` reusing `supplierLink` class | M | S | no |
| PROD-02 | bom/page.tsx:204 | Nav dead-end | BOM line `component?.name` plain `<strong>` | Select `component_id`; wrap name in `<Link>` to component | M | S | no |
| PROD-03 | bom/templates/page.tsx:108 | Nav dead-end | Template line `comp?.name` plain `<strong>` | Add `component_id` to select; `<Link>` to component | M | S | no |
| PROD-04 | products/bom-editor.tsx:349 | Nav dead-end | BOM editor row `line.component.name` plain `<span>`; `component_id` in scope | `<Link>` to component; stop stepper click propagation | M | S | no |
| PROD-05 | products/bom-versions-tab.tsx:149 | Nav dead-end | Version-history component rows plain text | `<Link>` to component via `line.component_id` | L | S | no |
| PROD-06 | bom/templates/page.tsx:69-72 | A11y | `PageHeader` has no `eyebrow` and no `title` | Add `eyebrow="Products"` `title="BOM Templates"` | M | S | no |
| PROD-07 | products/[productId]/page.tsx:317-320 | A11y | Product detail `PageHeader` has no eyebrow/breadcrumbs | Add breadcrumbs (Products → title) | L | S | no |
| PROD-08 | components/component-table.tsx:91-96 | A11y | Group-header collapse `onClick` on `<tr>`, no keyboard handler | Move to real `<button aria-expanded>` in header cell | M | S | yes |
| PROD-09 | products/[productId]/variant-coverage-table.tsx:84-96 | A11y | Whole `<tr role="link">` duplicates inner variant `<Link>` — nested interactive | Drop row-level onClick/role/tabIndex; rely on cell `<Link>` | M | S | yes |
| PROD-10 | products/bom-versions-tab.tsx:531-540 | A11y | Version list `<div role="button">`, Space doesn't preventDefault | Use `<button type="button" aria-pressed>` | L | S | yes |
| PROD-11 | bom/page.tsx:154-158, :212 | A11y | Inline status `<select>` and qty `<input>` have no label | Add `aria-label` ("BOM status" / "Quantity per unit") | L | S | no |
| PROD-12 | bom/templates/template-forms.tsx:80-88 | A11y | AddLineForm select/qty placeholder-only, no label | Add `aria-label` to select + number input | L | S | no |
| PROD-13 | components/page.tsx:157-167 | Findability | Search form has no submit affordance/cue | Add search submit `<button aria-label="Search">` from `_ui/buttons` | L | S | yes |
| PROD-14 | products/page.tsx:376-383 | A11y/DS | Status is hand-rolled span badge, not `StatusBadge` | Replace with `<StatusBadge variant=…>` | L | M | no |

### Operations-A — purchasing / goods-inwards / inventory / stocktake (OPSA)

| ID | Location (file:line) | Category | Pain | Fix | Imp | Eff | Browser |
|----|------|----------|------|-----|-----|-----|---------|
| OPSA-01 | purchasing/page.tsx:187-192 | Nav dead-end | PO-line component name plain text | Select `component_id`; `<Link>` to component | M | S | no |
| OPSA-02 | purchasing/page.tsx:126-128 | Nav dead-end | Supplier name in PO row plain text | Add `supplier:supplier_id(id,name)`; `<Link>` | M | S | no |
| OPSA-03 | purchasing/page.tsx:137-143 | A11y | Inline status `<select>` per row, no label | `aria-label="Update status for PO-…"` | M | S | no |
| OPSA-04 | purchasing/page.tsx:200-207 | A11y | Inline qty `<input>` per row, no label | `aria-label="Quantity for line"` | M | S | no |
| OPSA-05 | purchasing/[id]/page.tsx:158 | Nav dead-end | PO-detail line component name plain text | Select component join; `<Link>` | M | S | no |
| OPSA-06 | purchasing/[id]/page.tsx:104-105 | Nav dead-end | Supplier name on PO detail plain text | Select supplier join; `<Link>` | M | S | no |
| OPSA-07 | purchasing/[id]/page.tsx:156 | DS | Raw `<th>/<td>` not composed `_ui/table` | Compose from `_ui/table.module.css` | L | M | yes |
| OPSA-08 | goods-inwards/receipt-list.tsx:262-265 | Nav dead-end | Linked PO plain text (linked elsewhere) | `<Link>` to `/app/purchasing/[id]` | H | S | no |
| OPSA-09 | goods-inwards/receipt-list.tsx:244,:168 | Nav dead-end | Supplier name in receipt + Due-In rows plain text | Carry `supplier_id`; `<Link>` | M | M | no |
| OPSA-10 | goods-inwards/receipt-list.tsx:177-182 | A11y | Due colour via inline hex; overdue partly colour-only | Move colour to CSS-module variants | L | S | yes |
| OPSA-11 | goods-inwards/receipt-detail.tsx:474 | Nav dead-end | Receipt-line component name plain text | `<Link>` to component | H | S | no |
| OPSA-12 | goods-inwards/receipt-detail.tsx:315 | Nav dead-end | Supplier header plain text | `<Link>` when `supplier_id` present | M | S | no |
| OPSA-13 | goods-inwards/receipt-detail.tsx:297-345,383-441,524-534 | A11y/DS | Heavy inline layout + hardcoded radii | Move to CSS module; use radius tokens | M | M | yes |
| OPSA-14 | goods-inwards/receipt-detail.tsx:548-563 | A11y | Cost-update checkboxes + empty `<th>` no label | `aria-label` per checkbox; header text | M | S | no |
| OPSA-15 | goods-inwards/receipt-detail.tsx:498 | Inline-edit | Line `cost_per_unit` read-only; mistyped cost forces re-creating receipt | Make editable inside existing edit mode | M | M | yes |
| OPSA-16 | goods-inwards/receipt-form.tsx:346-352 | A11y | PDF file input no label | `aria-label="Delivery docket PDF"` | M | S | no |
| OPSA-17 | goods-inwards/receipt-form.tsx:514-517,566-603 | A11y | Per-line select/qty/cost/note/batch no labels | `aria-label` per control | M | M | no |
| OPSA-18 | goods-inwards/receipt-form.tsx:294-465 | DS | Pervasive inline style + hex fallbacks | Move to CSS module; drop `green` fallback | M | M | yes |
| OPSA-19 | goods-inwards/receipt-form.tsx:634 | A11y | Cancel is `<a>` styled as button (OK, inconsistent) | Confirm link role; no change needed | L | S | yes |
| OPSA-20 | inventory/page.tsx:187-191 | Nav dead-end | Balance component name plain text | Select component join; `<Link>` | H | S | no |
| OPSA-21 | inventory/page.tsx:231 | Nav dead-end | Recent-movement component name plain text | Add component join; `<Link>` | M | S | no |
| OPSA-22 | inventory/page.tsx:140-143 | Findability | Balance rows don't deep-link to component stock history | Add component links (see OPSA-20) | M | S | no |
| OPSA-23 | inventory/movement-form.tsx:142-150 | Inline-edit/Find | Reference type/ID are free-text raw-UUID inputs | Typed entity picker or hide behind disclosure | M | M | yes |
| OPSA-24 | inventory/movement-form.tsx:196-201 | A11y | Low-stock badge not announced on row | Optional `aria-label`/`title` on row | L | S | yes |
| OPSA-25 | stocktake/page.tsx:166-198 | DS | Sessions "table" hand-built from div/span | Rebuild with `_ui/table` or ListPanel/ListRow | M | M | yes |
| OPSA-26 | stocktake/page.tsx:83-87,101-104,154 | A11y | `<dialog popover>` lacks `aria-labelledby`/focus mgmt | Add `aria-labelledby`; verify focus | M | S | yes |
| OPSA-28 | stocktake/[sessionId]/page.tsx:288-289,160 | Nav dead-end | Variance-line component name/SKU plain text; `component.id` selected | `<Link>` to component | M | S | no |
| OPSA-29 | stocktake/[sessionId]/page.tsx:308-317 | A11y | Variance reason `<select>`/notes `<input>` no label | `aria-label` | M | S | no |
| OPSA-30 | stocktake/[sessionId]/counting-sheet.tsx:159-181 | Nav dead-end + A11y | Counting-row component name plain; count input no label | `<Link>` + `aria-label` on count input | M | S | no |
| OPSA-31 | stocktake/[sessionId]/import-csv-button.tsx:37-39 | A11y | Status `<span>` colour-only signal | Add `aria-live="polite"` + word/icon | M | S | yes |
| OPSA-32 | stocktake/[sessionId]/print + goods-inwards print | A11y | Hardcoded hex + injected print script | Acceptable for print-only CSS; add `type="button"` | L | S | yes |
| OPSA-33 | goods-inwards/receipt-list.tsx:120-128 | A11y | Filter tabs active state class-only | Add `aria-pressed` (or tablist roles) | L | S | yes |

*(OPSA-27 dropped: location has no detail route — not a dead-end.)*

### Operations-B — costing / capacity / staffing / planning (OPSB)

| ID | Location (file:line) | Category | Pain | Fix | Imp | Eff | Browser |
|----|------|----------|------|-----|-----|-----|---------|
| OPSB-01 | departments/page.tsx:140-181 | Inline-edit | Admin/electricity/gas/overhead rates forced to hidden `0` — 4 of 5 cost rates uneditable | Surface all 5 rates as labelled inputs; remove hidden `0` overrides | H | M | no |
| OPSB-02 | costing/page.tsx:206-234 | Findability | Snapshot rows read-only; no link to job/order, no per-row regen | Link job title to `/app/orders/[orderId]` | M | M | no |
| OPSB-03 | costing/page.tsx:217,251 · actual-time/page.tsx:324,362 | Nav dead-end | Job/variant titles plain `<strong>` | `<Link>` to order/variant (select ids) | M | M | no |
| OPSB-04 | staff-costings/page.tsx:3-5 + orphaned staff-forms.tsx | Findability | Route is a bare redirect to /departments; built `RateEditor` is dead code | Delete orphan or wire `RateEditor` into /departments | M | M | yes |
| OPSB-05 | costing/page.tsx:124-127,155 | DS/Find | Hand-rolled header, off-taxonomy eyebrow "Profitability Engine" | Use `PageHeader eyebrow="Operations" title="Job Costing"` | M | S | no |
| OPSB-06 | capacity/staffing/actual-time/departments page headers | A11y/DS | None use `PageHeader`; departments has no eyebrow/title at all | Add `PageHeader` w/ correct eyebrow + title | M | M | no |
| OPSB-07 | staffing/page.tsx:511-513 | Inline-edit | Read-only rate display looks uneditable; editable inputs far above | Remove dup display or link to editable fields | L | S | no |
| OPSB-08 | planning/floor/floor-board.tsx:202-206 | A11y | List `<tr>` opens drawer via onClick, no keyboard | Add role/tabIndex/onKeyDown (mirror JobCard) | M | S | yes |
| OPSB-09 | planning/floor/floor-board.tsx:235-239,:31 · start-job-modal.tsx:31 | A11y | Icon-only ✕ close buttons no `aria-label`/`type` | Add `aria-label="Close"` + `type="button"` | M | S | yes |
| OPSB-10 | planning/floor/unstarted-panel.tsx + start-job-modal.tsx | DS/A11y | Panel/cards/buttons built from inline style + hex | Move to CSS module; compose `_ui/buttons`; tokens | M | L | no |
| OPSB-11 | planning/shopfloor/operator-queue.tsx:23-50 | A11y/Sec | Hardcoded client `MANAGER_PIN="1234"` via `window.prompt` | Server-verified role check + accessible dialog | M | M | yes |
| OPSB-12 | staffing/page.tsx:405-535 | Inline-edit/DS | 13-field edit form inline per row; labels not associated | Move edit to `<dialog>`; associate labels via htmlFor/id | M | L | no |
| OPSB-13 | departments/page.tsx:158 | DS | Add-dept form uses inline layout style | Move layout to CSS module | L | S | no |
| OPSB-14 | capacity/page.tsx:163-204 · staffing/page.tsx:256-303 | Findability | Dept names plain `<strong>`; can't jump to dept rates from an overload | `<Link>` dept name to `/app/departments` | L | S | no |

### Logistics — suppliers / locations (LOG)

| ID | Location (file:line) | Category | Pain | Fix | Imp | Eff | Browser |
|----|------|----------|------|-----|-----|-----|---------|
| LOG-01 | suppliers/[supplierId]/supplier-tabs.tsx:460 | Nav dead-end | Catalog component name plain `<span>` | `<Link>` to component (id loaded) | H | S | no |
| LOG-02 | suppliers/[supplierId]/supplier-tabs.tsx:466-467 | Inline-edit | Base unit_cost/part#/MOQ/lead-time read-only; must unlink+relink | Add inline edit via `updateSupplierComponent` action | H | M | no |
| LOG-03 | suppliers/[supplierId]/supplier-tabs.tsx:485-487 | A11y | Preferred star button no `aria-label` | `aria-label` set/unset preferred | M | S | no |
| LOG-04 | suppliers/[supplierId]/supplier-tabs.tsx:511 | A11y | Price-break `×` remove no accessible name | `aria-label="Remove price break"` | M | S | no |
| LOG-05 | suppliers/[supplierId]/supplier-tabs.tsx:268-280 | A11y | Link-component form placeholder-only, no labels | Wrap controls in `<label>` (visually-hidden ok) | M | M | no |
| LOG-06 | suppliers/[supplierId]/supplier-tabs.tsx:221-248 | A11y | Add-contact inputs placeholder-only | Add `<label>` per input | M | S | no |
| LOG-07 | suppliers/[supplierId]/supplier-tabs.tsx:177-182 | Findability | Notes only render when present; add/view only via Edit mode | Always show Notes w/ empty hint | L | S | no |
| LOG-08 | suppliers/import/page.tsx:104 | Findability | Raw `<h1>`; only entry link is admin-gated | Use `PageHeader eyebrow="Logistics"`; reconsider gating | M | M | no |
| LOG-09 | suppliers/import/page.tsx:127-143 | A11y | File input no label; "drop zone" doesn't accept drops | `aria-label`; implement drop or relabel copy | M | M | yes |
| LOG-10 | warehouse/locations/locations-tree.tsx:260-377 | A11y | Expand/collapse-all buttons no `type`; not `_ui`-composed | Add `type="button"`; compose icon buttons | L | S | no |
| LOG-11 | warehouse/locations/locations-tree.tsx:33-60 | A11y | InlineForm name inputs placeholder-only | Visually-hidden `<label>`/`aria-label` | M | S | no |
| LOG-12 | warehouse/locations/locations-tree.tsx:188 · page.tsx:64 | Nav dead-end | "N components" count tags plain `<span>` — dead-end from location to stock | `<Link>` to `/app/components?location=<id>` if filter exists | M | M | yes |
| LOG-13 | settings/locations/page.tsx:36-50 | A11y/Layout | Bare fragment, no `.page` shell wrapper | Wrap in `<div className={styles.page}>` | L | S | yes |
| LOG-14 | settings/locations/default-location-picker.tsx:33 | A11y | "Set as default" buttons all read identically | `aria-label={Set ${loc.name} as default}` | L | S | no |

### Orders + Dashboard + Reports (ORD)

| ID | Location (file:line) | Category | Pain | Fix | Imp | Eff | Browser |
|----|------|----------|------|-----|-----|-----|---------|
| ORD-01 | reports/po-summary/page.tsx:85 | Nav dead-end | Supplier name plain text | `<Link>` (add `supplierId`, select join) | M | S | no |
| ORD-02 | reports/po-variance/page.tsx:121 | Nav dead-end | Supplier name plain text | `<Link>` (add `supplierId`) | M | S | no |
| ORD-03 | reports/po-variance/page.tsx:122 | Nav dead-end | Component name plain text | `<Link>` (add `componentId`) | M | S | no |
| ORD-04 | reports/inventory-integrity/page.tsx:81 | Nav dead-end | Component name plain — can't reach offending component | Carry `componentId`; `<Link>`, fallback for "—" | M | M | no |
| ORD-05 | orders/[orderId]/_tabs/sales-items-tab.tsx:74 | Nav dead-end | Variant title plain; `variant_id` dropped upstream | Keep `variant_id`; `<Link>` to variant | M | S | no |
| ORD-06 | orders/[orderId]/_tabs/sales-items-tab.tsx:89 | Nav dead-end | Shortage component names plain; `componentId` carried | `<Link>` to component | L | S | no |
| ORD-07 | orders/[orderId]/_tabs/production-tab.tsx:43 | Nav dead-end | `line_label` variant plain text | Pass `variant_id`; `<Link>` to variant | L | M | no |
| ORD-08 | orders/[orderId]/page.tsx:404-409 | A11y | Re-run allocation button no busy/disabled state | Add pending/disabled state; verify focus | L | M | yes |
| ORD-09 | orders/[orderId]/page.tsx:408 · delivery-tab.tsx:62 | A11y/DS | Action buttons hand-styled, not `_ui/buttons` | Compose from `_ui/buttons`; verify focus/contrast | L | S | yes |
| ORD-10 | orders/_components/orders-filters.tsx:31-56 | A11y | Search + 3 selects no label (dates do have aria-label) | Add `aria-label` to search + each select | M | S | no |
| ORD-11 | orders/page.tsx:112-117 | A11y/Find | Sync button hand-styled; no confirm/pending on heavy action | Compose `_ui/buttons`; add pending state | L | S | yes |
| ORD-12 | page.tsx:281-291 | Nav dead-end | Dashboard low-stock rows plain text (open-orders rows beside them are `<Link>`s) | Make each `alertRow` a `<Link>` to component | M | S | no |
| ORD-13 | page.tsx:284-286 | A11y | Days-remaining bar visual-only, no text alt | `role="img"` + `aria-label`, or `aria-hidden` | L | S | yes |
| ORD-14 | page.tsx:173-178,:264-268 | Findability | "Low stock" links to unfiltered component list | Point to filtered view / stock-on-hand report | M | M | no |
| ORD-15 | _dashboard/chart-card.tsx:102-178 | A11y | Recharts SVGs no `role="img"`/aria-label/text alt | Wrap in `<figure role="img" aria-label>` (mirror report-chart) | M | S | yes |
| ORD-16 | _dashboard/chart-card.tsx:81-90 | A11y | Chart series tabs no `aria-pressed`/role | Add `aria-pressed` (or tablist) | L | S | yes |
| ORD-17 | reports/_components/date-preset-bar.tsx:125-131 | A11y/DS | Print/PDF button hand-styled | Compose Export/Print from `_ui/buttons` | L | S | yes |
| ORD-18 | orders/[orderId]/page.tsx:516-522 | Nav dead-end | Dept name in overload warning plain (no dept detail route) | Leave as text; include dept name in staffing link label | L | S | no |

### Admin — settings / super-admin / activity-log / trash (ADM)

| ID | Location (file:line) | Category | Pain | Fix | Imp | Eff | Browser |
|----|------|----------|------|-----|-----|-----|---------|
| ADM-01 | activity-log/table.tsx:92-106 | A11y | Search + 2 date inputs no label | `aria-label`; compose input from `_ui` | M | S | yes |
| ADM-02 | activity-log/table.tsx:149,169,199-202 | Nav dead-end | Log rows reference entity as plain text | `<Link>` to entity detail when `metadata.entity_id` known | M | M | no |
| ADM-03 | activity-log/table.tsx:91,131 | A11y/Layout | Page-level two-column grid instead of canonical shell + `_ui/table` | Re-lay single-column; `_ui/table`; detail as in-card panel | L | M | yes |
| ADM-04 | trash/page.tsx:116-131 | Find/A11y | `PageHeader` has no eyebrow/title (no `<h1>`) | Add `eyebrow="Admin" title="Trash"` | M | S | no |
| ADM-05 | trash/page.tsx:202-279 | Nav dead-end | Archived POs/stocktakes plain `<strong>`; can't inspect before restore | `<Link>` to PO/stocktake detail (BOM has none) | M | S | no |
| ADM-06 | trash/page.tsx:180-187 | Nav dead-end | Delete-activity rows plain text | Link to activity-log (filtered) / entity | L | S | no |
| ADM-07 | settings/settings-sidebar.tsx:12-18 | Findability | Order-settings page not in sidebar — URL-only | Add `{href:"/app/settings/orders",label:"Orders"}` | H | S | no |
| ADM-08 | super-admin/page.tsx:138-143 | Nav/A11y | Status-filter tabs raw `<a href>` (full reload) | Replace with `next/link` `<Link>` | M | S | no |
| ADM-09 | super-admin/audit/page.tsx:81,91 | Nav dead-end | Actor/target-user plain text (no user route) | Acceptable; optionally link actor to team | L | S | no |
| ADM-10 | super-admin/tenants/[tenantId]/members-panel.tsx:108-110 | Inline-edit/Find | Add-member needs hand-pasted raw `auth.users.id` UUID | Email lookup → resolve profile id server-side | H | M | no |
| ADM-11 | super-admin team/members/new-tenant buttons | A11y | Action buttons raw `<button>`, not `_ui/buttons` | Compose from `_ui/buttons` | L | M | yes |
| ADM-12 | super-admin audit/team/members/tenant tables | A11y | Hand-written `styles.table` not `_ui/table` | Compose `.table`/`.tableCard` from `_ui/table` | M | M | yes |
| ADM-13 | super-admin/tenants/[tenantId]/page.tsx:156-158 | A11y/tokens | Inline `style` colour/layout on vitals-error | Move to CSS-module class | L | S | no |
| ADM-14 | super-admin modals (4) | A11y | `div`+onClick backdrops, no `role="dialog"`/aria-modal/focus trap/Esc | Shared `<dialog>` primitive or add roles + Esc + focus trap | M | M | yes |
| ADM-15 | settings/integrations/xero-manage.tsx:84-105 | A11y | Recent-syncs table hand-written | Compose from `_ui/table` | L | S | no |
| ADM-16 | super-admin page/audit/team `PageHeader` | Find/A11y | Super-admin headers have no `eyebrow` | Add `eyebrow="Admin"` (or "Platform") | M | S | no |

---

## 3. Cross-cutting patterns (batch by shared fix)

Fixing these as patterns is more efficient than one-by-one.

### P1 — Entity-name-as-link (largest pattern, ~35 findings)
Components, suppliers, POs, variants rendered as plain text where a detail route exists.
The fix is almost always: **select the id in the query, then wrap the name in `<Link>`.**
- **Components →** PROD-02,03,04,05; OPSA-01,05,11,20,21,28,30; OPSB-03; ORD-03,04,06,12; ADM-02,05
- **Suppliers →** PROD-01; OPSA-02,06,09,12; ORD-01,02
- **POs →** OPSA-08; ADM-05
- **Variants →** ORD-05,07
- **Departments →** OPSB-14 (and OPSB-02 job→order)

Recommendation: do the **High-impact ones first** (LOG-01, OPSA-08/11/20), then sweep the rest in one pass since the change is mechanical and consistent.

### P2 — Inline cost/price editing (your core complaint, ~6 findings)
Values you'd change are read-only where shown.
- LOG-02 (supplier unit_cost/part#/MOQ/lead-time), OPSB-01 (4 cost rates hidden), OPSA-15 (receipt line cost), OPSB-07/12 (staffing rates), costing snapshot (OPSB-02).
Recommendation: LOG-02 and OPSB-01 are the highest-value; both need a small server action + inline form.

### P3 — Form inputs without labels (~18 findings)
Placeholder-only inputs across forms.
PROD-11,12; OPSA-03,04,14,16,17,29,30; LOG-05,06,09,11,14; ORD-10; ADM-01.
Recommendation: a sweep adding `aria-label`/visually-hidden `<label>`. Low risk, high a11y payoff.

### P4 — Icon-only buttons without accessible names (~6 findings)
LOG-03,04; OPSB-09; PROD star toggle; OPSA close/dialog.
Fix: add `aria-label` + `type="button"`.

### P5 — PageHeader missing eyebrow/title (~8 findings)
PROD-06,07; OPSB-05,06; LOG-08; ADM-04,16.
Fix: add `eyebrow` (per taxonomy) + `title`/breadcrumbs. Mechanical.

### P6 — Hand-rolled tables instead of `_ui/table` (~6 findings)
OPSA-07,25; ADM-03,12,15; products list.
Fix: compose from `_ui/table.module.css`. Medium effort each.

### P7 — Modals without dialog semantics (ADM-14)
Super-admin modals are div+onClick. Fix once with a shared `<dialog>` primitive.

### P8 — Inline styles / hardcoded hex (DS, ~6 findings)
OPSA-13,18; OPSB-10,13; ADM-13. Move to CSS modules + tokens.

### P9 — Findability / dead routes
- ADM-07 (settings/orders not in sidebar — **quick win**)
- OPSB-04 (staff-costings is a dead redirect; orphaned RateEditor)
- ORD-14, LOG-12, OPSA-22 (filtered deep-links)

### P10 — Runtime-verify a11y (focus/contrast/keyboard)
Findings marked Browser=yes (PROD-08,09,10; OPSA-26,33; OPSB-08; ORD-08,13,15,16; ADM-14, etc.) — confirm in a Playwright pass once the structural fixes land.

---

## Recommended fix order

1. **Batch 1 — Quick wins (§1):** LOG-01, OPSA-08, OPSA-11, OPSA-20, ADM-07. One small PR.
2. **Batch 2 — P1 entity-link sweep:** the rest of the mechanical `<Link>` conversions.
3. **Batch 3 — P2 inline editing:** LOG-02 + OPSB-01 (the cost-edit pain the user raised).
4. **Batch 4 — P3/P4/P5 a11y sweep:** labels, aria, PageHeaders. Low risk, broad payoff.
5. **Batch 5 — P6/P7/P8 DS cleanup:** tables, modals, inline-style removal.
6. **Batch 6 — P10:** browser-verify the runtime a11y items.
