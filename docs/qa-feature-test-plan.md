# Manuva — Comprehensive Feature & QA Test Plan

A complete inventory of every feature in the app, organized by domain, with concrete
testable checks. Use this to verify ALL features work as expected.

## How to use this document

- Each feature lists its **entry point**, **what it does**, and a **checklist** of testable behaviors.
- Tick `- [ ]` → `- [x]` as you verify each item. Add `⚠️` + a note for anything broken.
- Items marked **(admin)**, **(super_admin)**, or **(gated)** require a specific role or a plan/feature flag.
- Suggested test tenants: one with a connected Shopify store and >1000 variants (e.g. *Fabulous Fabrications*), one fresh/empty tenant (for empty states), and one with the planning module enabled.

**Legend:** `(admin)` admin-only · `(super_admin)` super-admin-only · `(gated)` requires plan/feature flag · `RBAC` role-gated · `$` plan-limited.

---

## 1. Dashboard & Home

**Entry:** `/app` — KPI overview. Read-only aggregations.

- [ ] Quick-links bar shows counts: Products, Components, Suppliers, Open orders, Low stock (low-stock chip only appears when > 0, red)
- [ ] KPI chips: Inventory value (on-hand), Fulfillment rate (6-mo %), This week (fulfilled), Open orders, Revenue (30d), Avg order value, Gross margin %
- [ ] Fulfillment trend color: green ≥90%, neutral 70–89%, red <70%
- [ ] "This week" delta vs last week shows ↑ (green) / ↓ (red) / no change
- [ ] Low-stock section lists ≤8 components below reorder, with days-remaining bar (red ≤3d, orange ≤10d, green >10d) or "X avail" when burn rate unknown
- [ ] Open-orders card lists last 8 with ref, date, status badge
- [ ] Top products: two columns (most popular by units / highest profit by margin), ≤5 each; "no BOM" tag where applicable
- [ ] Finance chart (monthly revenue, last 6 mo) and Orders chart (weekly count, last 6 mo) render with trend
- [ ] Empty states: "No open orders right now", "All components above reorder points", "No sales in the last 30 days"
- [ ] Dev-flagged users are redirected to the dev dashboard

---

## 2. Products, Variants & Catalog

### Products list — `/app/products`
- [ ] Empty state when no products
- [ ] Sync success/error banners show product + order counts
- [ ] Pagination = 25/page; total count + page nav correct
- [ ] **Regression:** tenant with >1000 variants shows correct variant counts & prices on ALL products (not "0 variants") — the PostgREST 1000-row cap fix
- [ ] Search matches product title, description, variant title, SKU
- [ ] Status filter (All/Active/Draft/Archived) works
- [ ] Sort (asc/desc) on title, variant count, status, price, Material GP %, Actual GP %
- [ ] Material GP % color: green ≥30%, amber ≥10%, red <10%
- [ ] Actual GP % = sell − (material + labour + overhead); variants without BOMs show "—"
- [ ] Product image renders or shows fallback initial
- [ ] "Import Products" triggers Shopify sync

### Product detail — `/app/products/{productId}`
- [ ] Coverage bar "X / Y variants have a BOM"; amber badge when some lack BOMs
- [ ] Per-variant BOM status: "No BOM created" / active (version + line count) / "(draft in progress)"
- [ ] Material cost = Σ (cost × qty) / yield_pct; missing component costs → null margin + "missing costs" flag
- [ ] Labour = Σ run_hours × labor_rate (per dept); overhead combines admin + electricity + gas
- [ ] Inactive labor lines excluded from margins
- [ ] Description HTML is sanitized
- [ ] Worst variant = min actual margin (or material margin if no actual)

### Variant detail / BOM editor — `/app/products/variants/{variantId}`
Tabs: Overview, BOM, Routing, Versions, Notifications.
- [ ] **(RBAC)** Non-admin sees "Only admin/super_admin can create or copy BOMs" when no BOM exists; read-only otherwise
- [ ] Overview shows title, SKU, Shopify ID, sell price, created date, BOM summary
- [ ] **BOM tab:** create empty draft / from scratch; create from copy (another BOM); create from template (sets `source_template_line_id`)
- [ ] Creating a BOM increments version (latest + 1)
- [ ] Add/update component line: qty > 0 (zero filtered out); yield_pct accepts 0.85 or 85, normalized to decimal, must be >0 and ≤1
- [ ] Reorder component lines; delete line (draft only); delete draft BOM never deletes active BOM
- [ ] Duplicate BOM as new draft; save BOM as reusable component template
- [ ] **Routing tab:** add/update/delete labor op (dept, sequence, setup/run/admin hours, electricity, gas, notes, blocked_by)
- [ ] Duplicate sequence in same BOM rejected; sequences start at 1 and are unique
- [ ] Apply labor template clears template-sourced lines and re-applies all template ops
- [ ] Cost-per-unit table per op (labor/admin/electricity/gas/overhead/total) uses current effective rates; missing-rate departments listed as error
- [ ] **Notifications tab:** upsert trigger (routing_sequence, message_template, channel=email); remove trigger
- [ ] **Versions tab:** lists active + archived with line count, material cost, status badge

---

## 3. BOMs, Templates & Costing

### Component templates — `/app/templates?tab=components`
- [ ] Name required; add/remove/reorder template lines (component + qty)
- [ ] Line edits stamp `lines_updated_at`; "unpublished changes" badge when `lines_updated_at > last_published_at`
- [ ] Publish to selected BOMs creates a NEW BOM version, copies lines, sets `component_template_id`, marks `is_linked`; active BOMs archived, drafts untouched
- [ ] Publish to 0 BOMs marks template "published" (up-to-date intent)
- [ ] Affected-BOM count shown; delete template orphans provenance FKs without breaking BOMs

### Labor templates — `/app/templates?tab=labor`
- [ ] Name required; mode basic/advanced (toggle preserves lines)
- [ ] Every op needs dept + non-empty name; sequence integer ≥1 unique; hours/utilities ≥0
- [ ] Publish detects sequence collisions with manual lines and errors clearly
- [ ] Publish creates new BOM version, clears prior template-sourced lines, sets `source_template_line_id`

### Costing — `/app/costing`
- [ ] Metrics: open orders, active BOMs, snapshot count, actual rollup count
- [ ] "Generate financial plans" runs for open orders (RPC)
- [ ] Recent snapshots (≤10, newest first): sell price, planned margin, planned margin %, variance to actual
- [ ] "Awaiting actuals" when no rollup; variance red when actual > planned
- [ ] Snapshots frozen at generation (not changed by later rate changes); link to variant detail

### Staff costings — `/app/staff-costings`
- [ ] Page loads and reflects staff cost rates used by costing/margins

---

## 4. Components & Inventory

### Components list — `/app/components`
- [ ] Create component (name required; sku/unit/cost/reorder_point/low_stock_level/supplier/location/group/description optional)
- [ ] Supplier link auto-created `is_preferred=true` when supplier set on create
- [ ] **(admin)** Create component group inline; non-admin sees only "Import CSV" link
- [ ] Archive blocked if: active BOM usage, stock on-hand >0, open POs, or open order allocations exist; archived excluded from list
- [ ] Search (name/SKU/description) + low-stock filter (available < reorder_point)
- [ ] Stock status badge: OK / Low (orange) / Critical (red)
- [ ] Empty states (no components / all filtered out)
- [ ] **(admin)** CSV import 4-step (upload → preview → resolve suppliers/groups → commit); hard errors block, soft errors (unknown supplier/group) require resolve; fuzzy suggestions; same csvValue resolved once applies to all rows

### Component detail — `/app/components/{componentId}`
Tabs: Overview, Stock, BOM Usage, Receipts, Suppliers, Location.
- [ ] Stock value = on_hand × cost_per_unit; available = on_hand − reserved; in-production separate
- [ ] Reorder status shown below reorder_point
- [ ] **(admin)** Edit component (tracked before/after in activity log); archive shows conflict list first
- [ ] **(admin)** Bin location hierarchy warehouse → sub-location → aisle → bay; non-admin can't see Location tab
- [ ] BOM usage: product, variant, version, qty, active flag
- [ ] Recent receipts (last 5): date, supplier, reference, delivered qty
- [ ] Component image: fetch from Nexar via preferred supplier part number; upload custom (PNG/JPEG/WebP ≤5MB); remove; versioned URL (`?v=timestamp`)
- [ ] Inventory movements list: date, reason, delta_on_hand, delta_in_prod

### Inventory balances — `/app/inventory`
- [ ] Empty state references stocktake/receipts
- [ ] Metric cards sum on_hand / in_prod / reserved; low-stock count accurate; default-location count shown
- [ ] Recent movements (≤8): component, location, signed delta, reason, date; deleted refs show "Unknown"/"Unassigned"
- [ ] "Log Movement +" dialog: component + location required; reason ∈ {Receipt, Allocation, Adjustment, Production}; deltas accept ±decimals; validation errors shown; balances update after apply
- [ ] "Export CSV" downloads `inventory.csv` with header Component,SKU,Location,OnHand,InProd,Reserved; escaped values; sorted by on_hand desc

### Inventory invariants & reconciliation
- [ ] Movement that would create negative on_hand/in_prod/reserved or over-reservation fails with error (RPC enforced)
- [ ] reorder_point 0/null = no low-stock threshold; low-stock counted across all locations
- [ ] Reconciliation flags balance vs movement-sum drift beyond 0.0001 tolerance (audit tool)

---

## 5. Stock Movements, Stocktake & Scanning

### Stocktake sessions — `/app/stocktake`
- [ ] "New stocktake": count type Full/Initial; location required; notes optional; blind-count option
- [ ] Created with status "counting"; reference `ST-YYYY-NNN` (per-year sequence)
- [ ] All active components pre-loaded as lines with expected_on_hand (0 if no balance)
- [ ] Variance reasons auto-seeded on first use (Damage, Theft, Data Entry Error, Found Stock, Supplier Shortage, Other)
- [ ] "Set up your opening stock" banner when no balances + no completed sessions
- [ ] Session list: ref, type, location, date, line count, status badge; completed/archived dimmed
- [ ] Activity log captures session metadata

### Counting view — `/app/stocktake/{sessionId}` (status counting/open)
- [ ] Lines grouped by sub-location → aisle → bay (alpha); "No location set" group for unassigned
- [ ] Input saves on blur; "saving"→"saved" indicator (clears ~2s); error surfaced
- [ ] Progress N/total shown
- [ ] Blind mode hides Expected and variance; value/variance columns admin-only
- [ ] Section-scoped print link via `?sublocation&aisle&bay`

### Reconciliation — `/app/stocktake/{sessionId}` (status reconciliation)
- [ ] "Submit for review" blocked unless all lines counted
- [ ] Summary: variance line count, stock gains (AUD +), losses (AUD −), net adjustment
- [ ] Variance lines sorted by |$ impact|; show expected, counted, variance, variance % ("—" if expected 0), value (red/green)
- [ ] Variance reason mandatory before approve; notes optional per line
- [ ] **(admin)** "Send back for recount" → counting; "Approve & apply" → RPC apply, status completed
- [ ] RPC success returns applied_lines + adjustment_count; failure rolls back to reconciliation with error
- [ ] approved_by + timestamp recorded; activity log captures adjustment count; redirect with `apply_ok`

### Initial / opening stock
- [ ] Initial sessions skip reconciliation; "On-hand count" label; **(admin)** "Apply opening stock" requires all counted; balances created after apply

### Print sheet — `/app/stocktake/{sessionId}/print`
- [ ] Full + section scopes; scope label shows hierarchy path
- [ ] Expected hidden + blind warning when blind_count; visible otherwise
- [ ] Signature block + adapted instructions; prints cleanly

### CSV export/import
- [ ] Export (counting/reconciliation) `{ref}-stocktake.csv`, 9 columns, sorted by name; counted blank if null
- [ ] Import (counting/open only): .csv ≤5MB; matches component_id to lines; counted must be numeric ≥0; mismatches skipped; returns `{updated:N}`; sets counted_by/at; 400 if wrong status, 404 if session missing

### Scanner — `/app/scan`
- [ ] Home shows logo + two mode cards (Count Stock → `/app/scan/stocktake`, Set Locations → `/app/scan/locate`); "Open desktop app" link; mobile layout
- [ ] **Session picker** `/app/scan/stocktake`: lists open/counting sessions with ref, location, progress, blind badge; empty state; newest first
- [ ] **Live counting** `/app/scan/stocktake/{sessionId}`: all lines pre-loaded; barcode resolves component in-browser (no round-trip); count saves on blur; blind hides expected; search fallback; location filter
- [ ] **Locate** `/app/scan/locate`: scan barcode → component card + hierarchical location picker; confirm saves bin/location; search fallback; batched updates

---

## 6. Warehouse Locations

### Warehouse hierarchy — `/app/warehouse/locations` **(gated: binManagement)**
- [ ] Upsell shown if binManagement not enabled
- [ ] Tree renders warehouse → sub-location → aisle → bay with component-count badges
- [ ] Add/edit warehouse, sub-location, aisle (optional parent), bay; names required, parents enforced
- [ ] Delete blocked when components assigned; aisle delete prompts confirm if bays exist
- [ ] All changes revalidate the page; destructive ops confirm client-side

### Default location — `/app/settings/locations` **(admin, gated: binManagement)**
- [ ] Non-admin redirected to profile; upsell if not enabled
- [ ] Set default validates UUID + existence, clears other defaults, sets one; activity log `default_location_changed`
- [ ] Movement form & new stocktake pre-select default location

---

## 7. Orders, Allocation & Fulfilment

### Orders list — `/app/orders`
- [ ] Columns: Order #, Customer, Order date, Target ship, Total, Components, Production, Delivery
- [ ] Filters: status (Open/Fulfilled/Cancelled), source (Shopify/B2B), historical (All/Hide/Only), date range
- [ ] Sort: order_date (default), order_number, customer_email, status, target_ship_date, total (asc/desc)
- [ ] Pagination 25/page; empty state; Shopify sync messages
- [ ] Overdue indicator when past target ship + not shipped; historical badge; pipeline pills correct

### Order detail — `/app/orders/{orderId}` (tabs: Sales Items, Production, Delivery)
- [ ] Header: order #, customer, source, created, target ship (overdue indicator), total, line count
- [ ] Summary cards: order value, planned margin (+ line count), lines allocated (n/total), labour scheduled (hrs, actual margin)
- [ ] **Sales Items:** per line variant (linked), SKU, qty, unit/line price; BOM badge "BOM v{n}" / "BOM needed" / "Empty BOM"
- [ ] Short components list: required vs available (on_hand − reserved), earliest open-PO ETA or "no PO"; "In stock" when all available
- [ ] **Production:** labor plan grouped by line/dept/op with planned/actual hours + status (Planned/In progress/Completed); empty state; **reschedule week** updates only that plan + refreshes utilization for old/new weeks; validation requires plan_id/order_id/week_start
- [ ] **Delivery:** per-line status (Shipped green / Not shipped); "Mark shipped" only when unshipped (idempotent, sets shipped_at once); Shopify auto-sync note for shopify orders
- [ ] "Re-run allocation" triggers reconciliation; idempotent (duplicate `idempotency_key` → "already"); message "Allocation updated"/already
- [ ] Capacity overload warnings show dept, week, hours over, link to staffing

### Allocation engine (reconcile)
- [ ] Historical order → skipped entirely (0/0, clearedOnly false)
- [ ] Fulfilled/cancelled → clears allocations only (clearedOnly true)
- [ ] Open + no BOM / empty BOM → line skipped (skippedMissingBom++)
- [ ] New allocation created; existing updated when required qty differs; deleted when no longer needed
- [ ] Duplicate allocation rows deduped (primary kept)
- [ ] Reserved adjusted atomically via `apply_reserved_movement` (+ movement log); never negative (floored at 0)
- [ ] Missing default location → graceful 0-count exit; 0-line order → 0 counts
- [ ] `releaseOrderAllocations` reverses all allocations on cancel/fulfil

### Derived states (pipeline)
- [ ] Components state: empty / bom-needed / in-stock / partial (n of m + earliest ETA) / awaiting (ETA) / no-eta
- [ ] Production state: cancelled / not-started (no snapshots or no actuals) / in-progress / done (all snapshots completed)
- [ ] Delivery state: n-a / not-shipped / partially-shipped / shipped
- [ ] Allocation state (per line) determined by BOM structure only (no-bom / empty-bom / allocated) — independent of stock levels & existing allocation rows
- [ ] Target ship = created_at + source lead time; overdue only when past target AND not all shipped; days-late floored at 0

### Order SLA settings — `/app/settings/orders`
- [ ] Two inputs: Shopify lead time (default 7), Manual lead time (default 10); non-negative integers only; invalid rejected
- [ ] Saves to order_source_sla (tenant + source); applies to NEW orders only (existing keep target_ship_date)

---

## 8. Purchasing & Purchase Orders

### Purchase orders — `/app/purchasing`, detail `/app/purchasing/{id}`
- [ ] List sorted by created_at desc (≤12): po_number (or PO-{id}), supplier link, status badge, created, status dropdown
- [ ] Create PO: supplier required; PO number auto-increments (trailing digits) or custom; initial status "open"
- [ ] Add line: component + positive qty required; quantity_received starts 0
- [ ] Update line qty: rejected if new qty < quantity_received
- [ ] Detail: supplier card, status, line table (ordered/received/outstanding; fully-received faded), receipts section (docket link, date, status po_linked/discrepancy/unmatched)
- [ ] "Receive Goods" button only when status open/in_transit
- [ ] PO auto-transitions to "received" when all lines fully received
- [ ] Status lifecycle: open / in_transit / received / cancelled / archived
- [ ] Empty states; validation messages

---

## 9. Goods Inwards / Receiving

### List — `/app/goods-inwards`
- [ ] Receipts sorted by received_at desc: supplier_reference link, supplier, location, PO #, date, status badge, line count
- [ ] "Due POs" widget: open/in_transit POs without a receipt, expected within window (−90d … +14d), sorted by expected_date asc; only shows when applicable
- [ ] Empty state "No deliveries recorded"

### Create/edit — `/app/goods-inwards/new` (`?po=` / `?component_id=`), `/app/goods-inwards/{id}`
- [ ] Pre-fills supplier from PO; PO list filtered to matching supplier
- [ ] Location required (errors if none configured); supplier required (linked or override `__other__`); supplier_reference required; stock_in_reason required when no PO linked
- [ ] Lines: qty_delivered positive; cost_per_unit ≥0 or null; batch_number, notes optional
- [ ] Create sets status "unmatched" and calls `receive_delivery_receipt` RPC to update stock
- [ ] Link to PO: populates quantity_expected, updates quantity_received = min(delivered, outstanding); status computed po_linked vs discrepancy; PO auto-marked received when all filled
- [ ] Edit header (supplier, location, received_at, notes) + line notes; stock_in_reason immutable once PO linked
- [ ] **(admin)** Bulk update component costs from receipt lines (non-negative)
- [ ] PDF parse (Claude Haiku) extracts supplier_reference, received_at, lines; errors cleanly if no `ANTHROPIC_API_KEY`

### GRN print — `/app/goods-inwards/{id}/print`
- [ ] Header (company, GRN #, supplier, date, location, PO #), line table (component/SKU/expected/delivered/variance/cost/total/batch#/notes)
- [ ] Variance shows +N / −N / "—"; total value row only when a line has cost; print button; A4/letter clean; generated timestamp footer

---

## 10. Suppliers

### List — `/app/suppliers` (filter active/archived/all)
- [ ] Row: name (link), website subtext, component count, default lead time, last PO date, open PO count
- [ ] Archived visually distinct; filter controls visibility
- [ ] **(admin)** "Import CSV" link visible

### Create
- [ ] Name required; success "Supplier created."; appears immediately

### Detail — `/app/suppliers/{supplierId}` (tabs: Overview, Contacts, Catalog, History, Performance)
- [ ] **Overview:** edit contact/website/address/payment_terms/currency/lead time/notes; revalidates
- [ ] **(admin)** Archive sets is_active=false, redirects
- [ ] **Contacts:** add (name required) / remove; primary sorted first
- [ ] **Catalog:** link component (searchable active list), part number, unit_cost, currency, lead_time, moq; update/unlink; toggle preferred (clears others for that component first); price breaks add/remove (min_qty, unit_cost)
- [ ] **History:** POs (≤100, created_at desc): PO # link, status, dates, line count, delivery count, total
- [ ] **Performance:** avg actual lead time per component (only when ≥3 receipts), promised vs actual, on-time/late status (avg ≤ promised = on-time)

### CSV import — `/app/suppliers/import` **(admin)**
- [ ] Columns: name, website, default_lead_time_days, contact_name/email/phone, address, payment_terms, default_currency
- [ ] Hard errors: name required, duplicate in file, duplicate in DB (case-insensitive); soft: lead_time non-negative integer
- [ ] Preview table with per-row status; import disabled until errors fixed; ≤5MB; quoted/CRLF handled
- [ ] Commit only when clean; logs `suppliers_csv_imported`; done step shows count; template download; **(RBAC)** 403 if not admin

---

## 11. Production Planning **(gated: has_planning_module)**

### Floor board — `/app/planning/floor` (`/app/planning/` redirects here)
- [ ] When module off → redirect to `/app/planning/upgrade`
- [ ] Unstarted order lines panel (≤50, excludes historical), grouped by qty/product/order
- [ ] Department columns show active/queued/blocked steps with card details + status badge
- [ ] Drawer per line shows all sibling steps in sequence with scheduled/actual times
- [ ] `startJob`: auto (now) or manual start; scheduling computes earliest windows respecting blocked_by; inserts steps (queued if no blockers, blocked otherwise); guards duplicate starts; checks module flag
- [ ] `startStep`: queued→active, records actual_start + started_by
- [ ] `completeStep`: →complete, records actual_end, fires notification if configured, runs unlock cascade (completing sequence N unlocks steps with N in blocked_by)
- [ ] Activity log records startJob/startStep/completeStep; empty states

### Shop floor — `/app/planning/shopfloor` (gated)
- [ ] Steps grouped by dept, sorted by priority (sequence×10), filtered active/queued/blocked
- [ ] Cards show order #, product, op, status, blocked-by; shared start/complete + cascade; revalidates both planning pages; empty state

### Upgrade page — `/app/planning/upgrade`
- [ ] Static upsell: add-on badge, feature list, CTA email link

---

## 12. Capacity, Staffing, Departments & Actual Time

### Capacity — `/app/capacity`
- [ ] Week selector (Prev/Current/Next + Load); shows open orders, dept count, grain "Week"
- [ ] Dept table: name (→departments), available hrs, planned hrs + status (OK green / Over red / Spare green note)
- [ ] `refreshCapacityWeek` recomputes capacity + utilization (RPC), success/error toast; empty state per week

### Staffing — `/app/staffing`
- [ ] Week selector; metrics: Active staff, Contracted total, Net available, Missing rows
- [ ] Roster rows editable: name, dept, employment type, salary/hourly, standard hours, contracted-this-week, leave/training/non-productive/overtime, active, net available (= contracted − deductions + overtime)
- [ ] Dept pressure section sorted by overload desc
- [ ] `prepareStaffingWeek` creates missing rows for active staff (contracted = standard, deductions 0); success count
- [ ] `createStaffMember` / `updateStaffMember` persist + recompute net available; empty states

### Departments — `/app/departments`
- [ ] List: name + code badge, active toggle; active count in header
- [ ] Create/update dept + cost_rate_schedule (labor/admin/electricity/gas/overhead, effective_from); name+code required (code uppercased); rates default 0
- [ ] Revalidates departments/staffing/capacity/costing/actual-time/reports; empty state

### Actual time — `/app/actual-time`
- [ ] Form: order line (required), department (required), optional staff, hours (min 0.25 step 0.25), started/ended, note
- [ ] Disabled message when no orders/departments
- [ ] `createActualTimeEntry` via RPC (hours > 0); recent entries table (staff or "Department entry", hours, labor cost)
- [ ] Actual cost rollups table (job link, total cost, margin); metrics (entries, hours, labor cost); empty states; revalidates capacity/costing/reports

---

## 13. Reports

### Reports hub — `/app/reports`
- [ ] Inventory cards: Stock on hand, Movements (30d), Valuation, Dead stock (amber if >0), Stocktake history
- [ ] Purchasing cards: PO summary (red if overdue), Spend by supplier, Lead-time accuracy (color by threshold), PO variance
- [ ] System card: Inventory integrity (red if issues, else "Healthy"); each card links to its report

For each report below: sortable table, CSV export, correct date-range default, and empty state.
- [ ] **Stock on hand** `/reports/stock-on-hand`: name/SKU/location/on-hand/reserved/in-prod/value, status (Out/Low/OK); only on_hand>0; stat cards; no date filter
- [ ] **Valuation** `/reports/valuation`: on-hand cost + % of total (desc); on-hand/in-prod/reserved value cards; no date filter
- [ ] **Movements** `/reports/movements`: date/component/type badge/signed qty; daily in/out bar chart; default 30d
- [ ] **Dead stock** `/reports/dead-stock`: days-idle color (red ≥180, orange ≥90, green <90, "never moved"); idle threshold control (`?idle=90`); capital tied up
- [ ] **Spend by supplier** `/reports/spend-by-supplier`: spend, % of total, avg PO value; top-10 bar chart; default 90d
- [ ] **Lead-time accuracy** `/reports/lead-time-accuracy`: received/on-time/late/accuracy%/avg days late (worst first); no-expected-date counts as on-time; default 90d
- [ ] **PO variance** `/reports/po-variance`: only lines where expected≠delivered & expected not null; over/under cards; default 90d
- [ ] **PO summary** `/reports/po-summary`: status badge, expected date (overdue red+⚠), total value; open liability/outstanding/overdue cards; default 90d
- [ ] **Stocktake history** `/reports/stocktake-history`: status, lines counted, variance lines/qty; variance bar chart; default 365d
- [ ] **Inventory integrity** `/reports/inventory-integrity`: issue types (Invariant red / Reconciliation amber / Duplicate key amber / PO over-receipt blue); "Healthy" when 0; no date filter

---

## 14. Activity Log & Trash

### Activity log — `/app/activity-log`
- [ ] Lists activity newest-first, 50 per page, with Prev/Next pagination and a total count
- [ ] Three tabs — People / System / All — split the log by actor_type; defaults to People on load so automated noise is hidden
- [ ] People tab shows only user-initiated events; System tab shows only automated (Shopify/Stripe/System) events; All shows everything
- [ ] Counts and Prev/Next paging are correct per tab; switching tabs preserves date/search/event filters but resets to page 1
- [ ] The user filter is hidden on the System tab (and the actor param is cleared); each tab has its own empty-state message
- [ ] Event filter (from the catalog), user filter (tenant members), date-from/date-to, and text search all run server-side over full history (not just the current page)
- [ ] Filters + page persist in the URL (shareable/bookmarkable); search input reflects the active query after navigation
- [ ] User-initiated events show the operator's real name (full_name, else email)
- [ ] Automated events show a typed actor label ("Shopify", "Stripe billing", "System") with an "auto" chip — never a blanket "Shopify"
- [ ] Creating/updating/deleting business records (BOMs, components, POs, suppliers, inventory, stocktakes, locations, team members, etc.) each produce a log entry with a human-readable summary
- [ ] Deleting/archiving a record is logged (e.g. "who deleted that BOM")
- [ ] A logging failure never breaks the underlying action (logActivity/logSystemActivity swallow errors)
- [ ] Detail pane shows operator, entity (type + id), summary, and raw metadata

### Trash — `/app/trash`
- [ ] Sections: uninstalled Shopify stores, delete-activity log, archived POs, archived stocktakes, archived BOMs; each with empty state
- [ ] Restore PO (archived→open), stocktake (archived→open), BOM (→draft, is_active false) — revalidate related pages
- [ ] "Empty trash" shows item count, disabled when empty, irreversible warning; permanently deletes archived POs/lines, stocktakes/lines, BOMs/components, uninstalled stores; logs counts to activity_log

---

## 15. Shopify Integration

### Connect — `/app/settings/integrations` **(admin)**
- [ ] OAuth install/auth/callback: signed httpOnly state cookie; HMAC + state nonce validated (reject tampered/replay); shop domain normalized
- [ ] Token exchange stores expires_at; webhook registration errors caught (don't block store create)
- [ ] Cross-tenant install conflict blocks reassigning an active store
- [ ] Not-logged-in install → signed pending cookie → shopify-connect redirect
- [ ] Historical cutoff (`stats_only_before`) saves/persists; empty state when no stores

### Sync & webhooks
- [ ] Manual sync (`POST /api/shopify/sync`): auth+tenant, active store, refreshes token, checks scopes, syncs products/variants/orders/lines/allocations/plans, logs counts; missing-scope error lists required scopes; `return_to` must be an `/app/` path
- [ ] **(Regression)** Sync upserts products/variants by shopify_id and never touches `product_bom` → existing BOMs preserved
- [ ] Webhooks (`/api/shopify/webhooks`): HMAC (either app secret), dedupe by webhook_id, store event, auto-sync on product/order change, app/uninstalled handled, failure metadata persisted
- [ ] Embedded app session/token-exchange/sync routes function

### GDPR webhooks
- [ ] customers-redact / customers-data-request / shop-redact: HMAC validated, topic checked, request logged (idempotent by webhook_id), status created→completed/failed (error captured), 200 returned regardless

---

## 16. Xero / Accounting **(admin)**

- [ ] Connect (`/api/xero/install` → `/callback`): role check; signed state `nonce:tenantId`; mismatch blocks; exchanges code; fetches orgs ("no orgs" handled); deactivates prior connections; stores token_expires_at
- [ ] Disconnect (`/api/xero/disconnect`): role check; sets is_active=false
- [ ] Integrations page: connected status badge, account name, recent sync events (synced_at, status, external_id, error); empty state when not connected
- [ ] Bill push (`lib/accounting/push-bill`) posts accounting events

---

## 17. Billing & Subscription

### Checkout — paywall `/app/billing/paywall`
- [ ] Invalid tier/billing → 400; usage over target-tier limit (locations/users) → 400 with current/limit
- [ ] Creates/reuses Stripe customer (email, name, tenant_id metadata); session has line item + metadata + subscription_data
- [ ] Success → `/app/billing/success?session_id=...`; cancel → back to paywall; missing price ID → 500 "billing not configured"; 401 unauth

### Portal — past-due `/app/billing/past-due`
- [ ] "Update payment method" → Stripe portal (303), return URL `/app`; 401 unauth; 400 if no customer id

### Stripe webhook — `/api/webhooks/stripe`
- [ ] Missing/invalid signature → 400; rotated secrets supported (tries all); unconfigured secret → 500
- [ ] Event routed by type to handler; tenant from metadata.tenant_id; handler error → 500; success 200

### Access evaluation & gating
- [ ] No row / canceled / expired-trial → paywall; malformed row → paywall + log
- [ ] active → ok; trialing → ok + daysLeft; past_due <3d grace → ok (soft warn); past_due ≥3d → past_due_locked
- [ ] effectiveTier = pro during trial (if not expired) else selected_tier
- [ ] Layout checks access before rendering protected pages

---

## 18. Settings

### Profile — `/app/settings/profile`
- [ ] Update name (empty rejected); avatar upload (PNG/JPEG/WebP ≤2MB, versioned URL); email read-only; role read-only; password-reset email sends

### Company — `/app/settings/company` **(admin)**
- [ ] Non-admin → redirect to profile; name/timezone/currency required; logo upload (PNG/JPEG/WebP/SVG ≤2MB, versioned); created_at shown

### Appearance / Theme — `/app/settings/appearance`, `/app/settings/theme`
- [ ] Theme picker (light/dark/auto) toggles theme; default applied on load

### Invoices — `/app/settings/invoices` **(admin)**
- [ ] Non-admin → redirect; list desc; amount currency-formatted; signed download URL (1h); "unavailable" if signing fails; empty state

### Team — `/app/settings/team` **(admin)**
- [ ] Invite: email validated; **($)** user limit enforced (LimitExceededError); duplicate (unaccepted) updates token+expiry; email has inviter/tenant/role + accept URL; 7-day expiry
- [ ] Pending list shows expiry + "Expired" badge; revoke deletes; resend updates expiry + resends
- [ ] Members listed (admins first); current user "(you)"; avatar or initial; active/deactivated badge
- [ ] Change role (member/admin) — can't change own; deactivate — can't deactivate self; member-not-in-tenant error

---

## 19. Super Admin **(super_admin / platform_observer)**

### Tenants — `/app/super-admin`
- [ ] Table: name, health dot (ok/warn/critical + reasons tooltip), status pill, tier, trial_ends_at, members, created_at
- [ ] Status filter tabs w/ counts; name search (case-insensitive); health RPC fails gracefully (default ok)
- [ ] **(super_admin)** "+ New tenant" (disabled for observer); `?new=1` modal: name/timezone/currency/tier/trialDays/reason; trial = now + days; subscription trialing/annual; audit logged; no access row for creator
- [ ] Empty state

### Tenant detail — `/app/super-admin/tenants/{tenantId}`
- [ ] Header (name, created, tz, currency); deleted/suspended pills red; subscription section (tier/status/interval/trial/Stripe IDs/manual_override_at)
- [ ] Members (id, role, email via RPC); audit log (last 20)
- [ ] Vitals panel (RPC): last activity, 7d events, 7d active members, last sign-in, component/BOM/order/supplier counts, Shopify status + last sync, accounting provider + token expiry, 30d sync success/fail; error shown if RPC fails
- [ ] **(super_admin)** Controls: suspend (reason)/unsuspend, soft-delete/restore, extend trial (future date), change plan (tier/status + manual_override), add/remove/change-role member — all audit-logged; disabled by state
- [ ] "View as" (observer allowed) calls set_active_tenant RPC, logs, redirects to `/app`

### Platform team — `/app/super-admin/team`
- [ ] Lists operators (role, email, last sign-in); super_admin count; canMutate only super_admin
- [ ] **(super_admin)** Add (resolve email → profile; "no account" error), change role, remove — all block downgrading/removing the LAST super_admin; remove requires tenant_id set; audit-logged; self marked

### Audit log — `/app/super-admin/audit`
- [ ] Table: when, actor (email or short id), action, target tenant, target user, metadata JSON
- [ ] Days filter 1–365 (default 30); action filter dropdown; ≤500 rows; names/emails resolved via RPC; empty state

---

## 20. Notifications (production milestone emails)

- [ ] On `completeStep`, fires only when a trigger is configured for that BOM + sequence
- [ ] Template vars substituted ({{product_name}}, {{order_number}}, {{department_name}}, {{customer_first_name}})
- [ ] Sent once per (order_line_id + trigger_id) — deduped; delivery status sent/failed logged
- [ ] Skipped when customer email null; Resend failure handled gracefully; from "Manuva <noreply@manuva.app>"

---

## 21. Help & Documentation — `/app/help`

- [ ] Getting Started strip + module category cards (BOM, Inventory, Orders, Production, Purchasing, Stocktake, Reports)
- [ ] Article links route to `/app/help/{slug}` with no 404s for registered articles
- [ ] All ~25 help pages render (getting-started, bom/*, inventory/*, orders/*, production/*, purchasing/*, reports/*, stocktake/*)

---

## 22. Dev Dashboard / Monitoring — `/api/dev-dashboard/*`

- [ ] All endpoints (health, metrics, business, analytics, advisors, queries, vercel) require auth via guard; 401 when unauthorized
- [ ] Each returns expected JSON; no PII without auth
- [ ] `get_slow_queries`, `count_distinct_tenants`, `count_multi_location_tenants` RPCs return data (pg_stat_statements enabled)

---

## 23. Cross-cutting concerns

### Role-based access (RBAC)
- [ ] `member`: profile settings only; no workspace settings/admin actions
- [ ] `admin`: workspace settings, integrations, team, company, billing, invoices
- [ ] `super_admin`: all super-admin pages + lifecycle/plan/member mutations
- [ ] `platform_observer`: read-only super-admin + view-as, no mutations

### Subscription / plan enforcement
- [ ] Paywall redirect for no-subscription/canceled/expired-trial
- [ ] Past-due soft-lock after 3-day grace
- [ ] User & location limits enforced on invite / location create
- [ ] Feature gating (planning module, bin management) shows upsell when off

### Security & integrity
- [ ] All Shopify + Stripe + Xero webhooks/callbacks verify HMAC/signature
- [ ] OAuth state cookies signed + nonce (CSRF/replay safe)
- [ ] Shopify token auto-refresh on expiry
- [ ] Tenant isolation (RLS) — no cross-tenant data leakage
- [ ] Audit logging for super-admin actions, Shopify webhook events, GDPR requests

---

## Sign-off

| Domain | Tester | Date | Pass / Fail | Notes |
|---|---|---|---|---|
| 1. Dashboard | | | | |
| 2. Products & Variants | | | | |
| 3. BOMs/Templates/Costing | | | | |
| 4. Components & Inventory | | | | |
| 5. Stocktake & Scanning | | | | |
| 6. Warehouse Locations | | | | |
| 7. Orders & Allocation | | | | |
| 8. Purchasing | | | | |
| 9. Goods Inwards | | | | |
| 10. Suppliers | | | | |
| 11. Production Planning | | | | |
| 12. Capacity/Staffing/Depts | | | | |
| 13. Reports | | | | |
| 14. Activity Log & Trash | | | | |
| 15. Shopify | | | | |
| 16. Xero | | | | |
| 17. Billing | | | | |
| 18. Settings | | | | |
| 19. Super Admin | | | | |
| 20. Notifications | | | | |
| 21. Help | | | | |
| 22. Dev Dashboard | | | | |
| 23. Cross-cutting | | | | |

---

## Changelog

Append a dated line here whenever a feature is added or amended (see CLAUDE.md → "Feature test plan").
Format: `- YYYY-MM-DD — <added|amended> <feature name>: <one-line summary>`

- 2026-06-16 — added Feature & QA test plan: initial comprehensive inventory of all 23 domains.
- 2026-06-16 — amended Products list: page through all variants (PostgREST 1000-row cap fix) so >1000-variant tenants show correct counts/prices.
- 2026-06-17 — amended Activity log: full audit-trail coverage of all mutations, real/typed actors, server-side paged filtering.
- 2026-06-19 — amended Activity log: People/System/All tabs split the log by actor_type (default People) to separate the human audit trail from Shopify/system noise.
