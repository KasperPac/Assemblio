# 02 — Manuva financial data model: what an accounting sync could use

**Date:** 2026-10-01 · **Scope:** domain model only (the existing Xero code in `src/lib/accounting` and `src/app/api/xero` is covered in `01-existing-code-audit.md`) · **Read-only:** nothing was edited, committed or stashed.

**Sources and how much to trust them.**
- **[code]**: verified in the repo at `main` @ `63416549`.
- **[prod]**: verified against the production DB (`svhaotzrtfbwmphaacjj`) with SELECT-only schema queries, function definitions and aggregate counts. No personal data was read.
- **[inference]**: my reading, not verified. Flagged wherever it appears.

The local `supabase/schema.sql` is **behind prod**. Prod has columns it lacks, such as `purchase_order.po_number/expected_date` and `purchase_order_line.unit_cost`. All column lists below come from prod `information_schema`.

---

## 0. Headline findings

1. **Purchases are the only area close to sync-ready.** `delivery_receipt` + `delivery_receipt_line.cost_per_unit` is a usable source for an ACCPAY bill. It still carries no tax, invoice date, due date or invoice total, and its reference is a delivery-docket reference.
2. **No movement carries a cost.** `inventory_movement` holds quantity deltas only. Every valuation in the app multiplies quantity by the *current*, mutable `component.cost_per_unit` [code+prod]. Stock value at a past date, and COGS as it was at the time of sale, cannot be reproduced.
3. **Manufactured sales never consume stock.** Fulfilling a manufactured order only releases its reservation, so `on_hand` drops only through manual adjustments and stocktakes [code]. There is no production-order entity, no finished-goods stock and no WIP value. A perpetual Dr COGS / Cr Inventory journal therefore has no movement to come from.
4. **COGS per sale today comes from a BOM estimate, and coverage is close to zero.** `job_cost_snapshot` exists for **1 of 1,027** fulfilled live order lines [prod]. The main Shopify tenant has **2 active BOMs** against 738 live order lines [prod]. Snapshots are rebuilt at current cost on every Shopify sync while their status is `planned`, which is the only status any code writes, so none is ever frozen.
5. **There is no tax data anywhere.** Prod has no tax, GST, ABN, GL-code, discount, refund, fee, payout, invoice-number or due-date column [prod]. Shopify prices are stored *pre-discount* (`originalUnitPriceSet`), not the `discountedUnitPriceSet` the profitability spec called for, and with no tax-inclusive flag.
6. **There is no customer entity.** Shopify customer fields are deliberately written as null because the app has no `read_customers` scope [code].
7. **Currency is inconsistent.** `tenant.currency` defaults to **`'NZD'`** (4 of 7 tenants hold NZD), but every money display hard-codes **AUD** [prod+code]. No order or receipt records its currency.
8. **The accounting tables are not in prod.** `accounting_connection` and `accounting_sync_event` exist only as `supabase/patches/accounting_integration.sql` [prod]. No generic tenant-settings store or per-tenant feature-flag table exists.
   - The deployed plpgsql functions `get_tenant_vitals` (both tables) and `get_tenant_health_indicators` (`accounting_connection`) reference these missing tables [prod: verified in `pg_proc.prosrc`].
   - Whether those references raise on every operator call was not observed (the functions were not executed). `xero-audit` reports that the super-admin list swallows the error; that is in `01-existing-code-audit.md`.
9. **The integrations strategy rests on a premise the repo's own research contradicts.** The strategy doc (Part 4.4) says "A2X never touches inventory or COGS accounts". The repo's own A2X research says A2X has an optional COGS module that posts Dr COGS / Cr Inventory from SKU costs (`docs/research/competitor-integrations/results/A2X_accounting_sync_benchmark.json`). If Manuva posts COGS while a tenant has A2X COGS enabled, COGS is booked twice.

---

## 1. Financially meaningful events Manuva records

| # | Event | Table(s) | Trigger in code | Money fields | Notes |
|---|---|---|---|---|---|
| 1 | **Supplier created/edited** | `suppliers`, `supplier_contacts`, `supplier_components`, `supplier_component_price_breaks` | `src/app/app/suppliers/[supplierId]/actions.ts`; CSV `src/app/api/import/suppliers` | `supplier_components.unit_cost` + `currency` (catalogue price; not linked to `component.cost_per_unit`) | `payment_terms`, `address` and `default_currency` are free text. Filled on only 9 of 105 suppliers [prod]. |
| 2 | **PO raised** | `purchase_order` (`po_number`, `status`, `expected_date`), `purchase_order_line` (`quantity`, `unit_cost`, `quantity_received`) | `createPurchaseOrder` / `createPurchaseOrderLine`, `src/app/app/purchasing/actions.ts:46-149` | `purchase_order_line.unit_cost`. **The current UI never writes it, nor `expected_date`** (forms post only `po_number`, `supplier_id`, `status`, `component_id`, `quantity`). | All 93 prod PO lines have a `unit_cost`, but the last PO dates from 2026-05-23, so they predate or bypass the current forms [prod]. Status vocabulary: open, sent, in_transit, received, cancelled, archived. No tax and no currency. |
| 3 | **Goods received (delivery receipt)** | `delivery_receipt` (`supplier_id` or `supplier_name_override`, `supplier_reference` (required), `received_at`, `stock_in_reason`, `status`, `purchase_order_id`), `delivery_receipt_line` (`quantity_delivered`, `quantity_expected`, `cost_per_unit` (optional, blank by default in the form), `batch_number`, `purchase_order_line_id`) | `createDeliveryReceipt`, `src/app/app/goods-inwards/actions.ts:29-149` → RPC `receive_delivery_receipt` (`supabase/patches/receive_delivery_receipt_rpc.sql:45-53`) writes `inventory_movement` reason `delivery_receipt`. It then calls `pushBillToAccounting(tenantId, receipt.id)` (`:141`). | `delivery_receipt_line.cost_per_unit`: 32/32 lines filled in prod | `stock_in_reason` ∈ supplier_delivery, customer_return, opening_stock, sample, adjustment, other. **Only `supplier_delivery` is a purchase.** The others must not become bills. `linkReceiptToPo` (`:151-252`) re-links after the fact. |
| 4 | **Supplier invoice / bill captured** | none | none | none | **Not modelled.** The receipt doubles as the bill. Invoice number, invoice date, due date, totals and tax are all absent. |
| 5 | **Landed cost (freight, duty)** | none | none | none | **Not modelled** in schema or code. The strategy doc's line that Manuva "already calculates" landed cost is not borne out. |
| 6 | **Component cost changed** | `component.cost_per_unit` | Component edit (`src/app/app/components/actions.ts:110-140`), CSV import (`src/app/api/import/components/route.ts:204`), opt-in "update component costs" on a receipt (`goods-inwards/actions.ts:322-349`, last cost), retail scaffold, staff-costings rates (`src/app/app/staff-costings/actions.ts:34-91`) | The new cost only | **Revalues all on-hand stock silently.** No movement or history row is written. |
| 7 | **Manual stock adjustment** | `inventory_movement` (`delta_on_hand`, `delta_in_prod`, `reason`, `reference_*`), `inventory_balance` | `createMovement`, `src/app/app/inventory/actions.ts:20-58` → RPC `apply_inventory_movement` | **none** | Reason picker: receipt, allocation, adjustment, production (`movement-form.tsx:110-113`). No write-off, scrap or damage reason. |
| 8 | **Stocktake applied** | `stocktake_session` (`session_type` full/initial, `approved_by`, `approved_at`), `stocktake_line` (`expected_on_hand`, `counted`, `variance_reason_id`), `stocktake_variance_reason` (tenant list: Damage, Theft, Found Stock, Supplier Shortage, Data Entry Error, Other) | `approveAndApply` / `applyOpeningStock`, `src/app/app/stocktake/[sessionId]/actions.ts:132-249` → RPC `apply_stocktake_session` (prod) writes `inventory_movement` reason `stocktake_adjustment` | **none** | The best-structured shrinkage source: approver, timestamp and a named reason per line. The value must be computed at current cost. |
| 9 | **Opening stock** | `stocktake_session.session_type='initial'`, or a receipt with `stock_in_reason='opening_stock'` | as #8 / #3 | none (stocktake); optional line cost (receipt) | Candidate for an opening-balance journal. |
| 10 | **Order reserve / release** | `order_component_allocation`, `inventory_movement` (`delta_reserved`, reasons `order_reserve`/`order_release`) | `reconcileOrderAllocations` (`src/lib/allocation/reconcile-order.ts:199-390`) via the Shopify sync or the manual "Re-run allocation" action | none | No accounting effect. |
| 11 | **Production started / step completed** | `job_routing_step` (status, actual_start/end) | `src/app/app/planning/(gated)/floor/actions.ts:87, 116, 205` | none | **Does not move stock or cost.** Planning module only. |
| 12 | **Labour actual** | `job_actual_time_entry` (`hours`, `labor_rate_snapshot`, `labor_cost_amount`, `started_at`, `department_id`, `staff_member_id`) → `job_cost_actual_rollup` | `src/app/app/actual-time/actions.ts:28` → RPC `create_job_actual_time_entry` (prod) | `labor_cost_amount` = hours × rate frozen at entry | **The only cost frozen at event time** (23 entries in prod). Actual admin, electricity, gas and overhead are *copied from plan*, not measured (`refresh_job_actual_cost_rollup`). |
| 13 | **Finished-goods receipt** | none | none | none | **Not modelled.** `inventory_balance` is keyed on `component_id`. Square spec §1 finding 1: "Manuva has no finished-goods stock". |
| 14 | **Customer order created / updated (Shopify)** | `orders` (`order_number`, `status` open/fulfilled/cancelled, `shopify_*_at`, `fulfilled_at`, `historical`, `source`), `order_line` (`quantity`, `unit_sell_price`, `line_sell_price`, `shipped_at`) | `syncShopifyStoreData`, `src/lib/shopify/sync.ts:226-587`. Full history re-fetched on each webhook (orders/create, updated, cancelled, fulfilled; `shopify.app.toml:45`). | `unit_sell_price` = **`originalUnitPriceSet`** (pre-discount, `sync.ts:180, 460`); `line_sell_price` = sum. `product_variant.price` = list price. | Lines are **merged per variant** (`sync.ts:455-476`). Line items with no mapped variant are dropped. The `customer_*` fields are written as null (`sync.ts:402-406`). |
| 15 | **Customer order (manual)** | `orders.source='manual'` | **No create path in the current code** (no `orders` insert outside the Shopify sync) | as #14 | 246 manual rows in prod across 2 tenants, 2025-06-05 → 2026-05-11. Legacy or seed [inference]. |
| 16 | **Order fulfilled / shipped** | `orders.status='fulfilled'`, `fulfilled_at`; `order_line.shipped_at` | Shopify sync; manual `markLineShipped` (`src/app/app/orders/[orderId]/mark-shipped-action.ts`) | none | **Manufactured lines:** reservation released, `on_hand` unchanged (`reconcile-order.ts:242-268`). **Retail lines** (`product.kind='retail'`, since 2026-09-25): RPC `apply_sale_consumption` writes `inventory_movement` reason `sale`, once per line (`supabase/patches/2026-09-25-retail-stock-foundation.sql:53-189`). |
| 17 | **Order cancelled** | `orders.status='cancelled'` | Shopify sync | none | Releases reservations only. |
| 18 | **Returns / refunds** | only `delivery_receipt.stock_in_reason='customer_return'` (stock-in, not linked to an order, no value) | none | none | **Not modelled.** No `refunds/create` webhook, no refund fields in the order query. Retail plan 1: "refunds and returns do not restore stock". |
| 19 | **Cost snapshot (planned job cost)** | `job_cost_snapshot` (`sell_price`, `planned_material/labor/admin/electricity/gas/overhead/total_cost`, `planned_margin`, `rate_snapshot_json`, `bom_snapshot_json`, `snapshot_status`) | RPC `generate_job_financial_plan` (prod), called per live order line on every Shopify sync (`sync.ts:524-542`) and from `/app/costing` | planned costs | Material = Σ BOM qty × **current** `component.cost_per_unit`, **ignoring `yield_pct`** (the BOM editor divides by yield; 107 prod BOM lines have yield ≠ 1). The RPC deletes and recreates `planned` rows each run. No code writes any other status. The `draft`/`in_progress`/`final` rows in prod are legacy or seed. |
| 20 | **Activity log** | `activity_log` (`event`, `entity_type`, `entity_id`, `metadata`) | `src/lib/activity/log.ts`, catalogue `src/lib/activity/events.ts` | essentially none | An audit trail, not an outbox. Some events carry no `entityId` (for example `purchase_order.created`). Not usable as a sync source. |

**Movement reasons in prod** [prod]: `order_fulfillment`, `production_consume`, `production_reservation`, `supplier_delivery`, `opening_balance`, `goods_inwards`, `RECEIPT`, `purchase_order` (as `reason`) appear only in tenants `11111111…` and `a0000001…`. No current code path writes them (seed or legacy [inference]). The two real Shopify tenants show only `delivery_receipt`, `order_reserve`, `order_release` and `RECEIPT`. The main one, `777e700f…`, has **no on-hand movements at all**: it does not receive stock in Manuva.

---

## 2. Inventory valuation

- **Cost method: one mutable cost per component.** `component.cost_per_unit` is set by hand, by CSV import, or optionally overwritten with a receipt's line cost (last cost, ticked by the user) [code]. It is not FIFO, weighted average or true standard costing: nothing captures variance against a standard.
- **There is no per-movement cost ledger.** `inventory_movement` has no unit cost or value column [prod].
  - Valuation report: `on_hand × current cost` (`src/app/app/reports/valuation/page.tsx:36-45`).
  - Dashboard "Received/Consumed $": historical quantities × *today's* cost (`src/app/app/_dashboard/finance-chart.tsx:29, 52`).
- **Quantity at a date can be derived; value at a date cannot.** Summing `delta_on_hand` reproduces `inventory_balance.on_hand` for every row in the real tenants. All 15 mismatching rows (of 129) are in tenant `a0000001…` (legacy reasons) [prod]. The value side fails because of the point above.
- **COGS per sale:**
  - **Retail:** sold quantity is recorded (`sale` movement → `order_id`). COGS = qty × current cost, not frozen.
  - **Manufactured:** no consumption is recorded. The only COGS is the BOM estimate: `job_cost_snapshot` (not frozen, ~0% coverage) or `dashboard_product_sales` (prod RPC: active BOM × current cost, computed at query time).
- **Raw material for a FIFO or weighted-average rebuild (not built):** `delivery_receipt_line` holds dated purchase quantity × cost. That covers the inbound side only. The outbound side (manufactured consumption) does not exist.
- **WIP:** `inventory_balance.in_prod` is a quantity bucket, moved only by the manual movement form, and valued at current cost in reports. There are no WIP accounts and no WIP roll-forward. 59 balance rows have non-zero `in_prod` [prod].

---

## 3. Data an accounting sync would need

| Need | Status | Where / note |
|---|---|---|
| Supplier contact | **Partial** | `suppliers.name`, `contact_name/email/phone`, `website`, `address` (single free-text field), `payment_terms` (free text), `default_currency` (text). Mostly empty: 9/105 have terms, address or currency. Receipts may use `supplier_name_override` with no supplier row. |
| Supplier ABN / tax number / bank details | **Absent** | — |
| Customer records | **Absent** | No customer table. `orders.customer_email`/`customer_first_name` are null for all Shopify orders (no `read_customers` scope, `src/lib/shopify/scopes.ts`). |
| Tax / GST per line, tax-inclusive flag | **Absent** | No column anywhere. Shopify `originalUnitPriceSet` follows the shop's taxes-included setting, which Manuva does not record [inference from Shopify's model]. |
| Currency, FX | **Inconsistent** | `tenant.currency` default `'NZD'` (`settings/company/company-form.tsx:24-25` offers NZD/AUD). UI hard-codes `AUD` in ~15 places (e.g. `reports/valuation/page.tsx:65`, `app/page.tsx:14`). No currency on orders, receipts or PO lines. Supplier and catalogue currency are text, mostly null. No FX. |
| Supplier invoice number, invoice date, due date | **Absent** | Nearest: `delivery_receipt.supplier_reference` (required free text, docket or invoice ref) and `received_at`. Due date would have to be derived from free-text `payment_terms`. |
| Sale prices | **Present, gross of discounts** | `order_line.unit_sell_price` / `line_sell_price` (1860/1860 > 0 [prod]); `product_variant.price`. |
| Discounts, shipping, tips, gift cards | **Absent** | — |
| Payment / financial status | **Absent** | Only fulfilment status (open, fulfilled, cancelled). |
| Account / GL codes, tracking categories | **Absent in prod** | Only `accounting_connection.default_account_code` (default `'300'`) in the unapplied patch `accounting_integration.sql:13`. No per-component, per-group or per-reason account mapping. `department` could feed a tracking category [inference]. |
| Items | **Partial** | `component` (`sku`, `name`, `unit`, `cost_per_unit`) and `product_variant` (`sku`, `title`, `price`). SKUs are **not unique** (Square spec §4.2), which conflicts with Xero's unique `Item.Code` (max 30 chars) [Xero limit from general knowledge, not verified here]. |
| Units and rounding | **Weak** | All quantities and money are unbounded `numeric`. `component.unit` is free text. No rounding policy (Xero wants 2 dp line amounts) [inference]. |
| Idempotency / sync ledger | **Absent in prod** | `accounting_sync_event` (patch only) keys on `(entity_type='bill', entity_id)`. |
| Labour cost at event time | **Present** | `job_actual_time_entry.labor_cost_amount`, `labor_rate_snapshot`. |

---

## 4. Sales channels

**Shopify (live).** Manuva stores:
- order number, dates, status (open/fulfilled/cancelled), `fulfilled_at`, per-line `shipped_at`
- per-variant quantity and pre-discount unit price
- variant list price, SKU and barcode

It does **not** store tax, discounts, shipping, currency, customer, payment/financial status, refunds, transaction fees or payouts (`sync.ts:164-191`; scopes `read_products,read_orders` only, `shopify.app.toml:20`). A sales invoice built from this data would be wrong on tax and discounts.

**Square: not built.** Only plan 1 of 3 (retail stock foundation) is merged. There is no `src/lib/square/` and no Square tables in prod. The design spec (`docs/superpowers/specs/2026-09-25-square-pos-integration-design.md`) has **no money handling at all**: no price, tax, fee or payout. Its planned scopes are `ITEMS_READ`, `INVENTORY_READ/WRITE`, `ORDERS_READ` and `MERCHANT_PROFILE_READ`. Square sales would land in `orders`/`order_line` like Shopify ones.

**What Manuva can add that A2X or Square-for-Xero cannot:**
1. **Bills from goods receipts.** Supplier, PO link, per-line cost and quantity received.
2. **Shrinkage and write-off journals from stocktakes.** Named variance reasons and an approver.
3. **Labour absorption** from frozen time-entry costs.
4. **BOM-derived unit cost per variant.** Either fed to A2X's COGS module as SKU costs, or posted by Manuva as its own COGS journal, but **not both**. A2X's COGS module values sold units from SKU costs held inside A2X and posts Dr COGS / Cr Inventory (repo research, see §0.9).

Today that BOM cost is uncovered: the main Shopify tenant has 2 active BOMs. It is also unfrozen: a cost edit changes historical COGS.

---

## 5. Multi-tenancy, settings, gating

- **Where Xero mappings could live.** `tenant` has `name`, `logo_url`, `timezone`, `currency`, `has_planning_module` and suspension fields. There is no settings JSON and no key-value table. The other per-tenant stores are narrow (`tenant_dashboard_config`, `order_source_sla`).
  - The unapplied `accounting_connection` table holds a single `default_account_code`.
  - Mappings would need new tables: account per event type, tax rate per line type, tracking category per department, contact and item ID cross-references, sync log [inference].
  - Tenant context comes from `getServerTenantContext()`. RLS is `tenant_id = current_tenant_id()`. Service-role writers pass through `assert_tenant_write_access` (prod).
- **Plan gating.**
  - Tiers and feature flags are a static map: `PLANS` in `src/lib/plans/index.ts`, starter/growth/pro/enterprise. `hasFeature()` lives in `src/lib/plans/features.ts`. `effectiveTier` returns `pro` during a trial.
  - **Only two flags are enforced:** `advancedBom` (`products/variants/[variantId]/page.tsx:144`) and `binManagement` (`settings/locations/page.tsx:21`, `warehouse/locations/page.tsx:19`). `costingModule`, `financialProfitability`, `exportPdfCsv`, `apiAccess` and `multipleShopifyStores` are defined but never checked [code].
  - **Shopify is not plan-gated.** Every tier has it (`src/app/pricing/_data/tiers.ts:90-96`). The embedded routes check only paywall status (`getSubscriptionAccess`).
  - The planning module is gated by the per-tenant boolean `tenant.has_planning_module`, outside the plan system.
  - No generic per-tenant feature-flag store exists, although the Square spec calls for one ("behind a per-tenant flag").
  - Xero does not appear on the pricing page.
- **Prod subscriptions:** growth/trialing 3, pro/active 1, pro/trialing 2, starter/trialing 1 [prod].

---

## 6. Manuva event → candidate Xero object → readiness

| Manuva event | Candidate Xero object | Data readiness |
|---|---|---|
| Supplier created/updated | **Contact** (supplier) | **Gaps:** no ABN or tax number; free-text address and terms; currency mostly null; no Xero ContactID column; override-only suppliers have no record. |
| Customer | **Contact** (customer) | **Not modelled.** No customer entity; Shopify customer data not collected. A per-channel generic contact is the only option. |
| Component / variant | **Item** (untracked) | **Gaps:** SKU not unique, free-text unit, no account or tax defaults. |
| PO raised | **PurchaseOrder** (optional) | **Gaps:** UI captures no unit cost and no expected date; no tax or currency. |
| Goods receipt (`stock_in_reason='supplier_delivery'`) | **Bill (ACCPAY Invoice)** | **Gaps:** no tax or GST, invoice number (docket ref only), invoice or due date, or currency; line cost optional; receipt ≠ invoice (no 3-way match). Closest to ready. |
| Supplier invoice capture | Bill | **Not modelled.** |
| Landed cost (freight/duty) | Bill lines + **ManualJournal** allocation | **Not modelled.** |
| Return to supplier | **Credit note (ACCPAYCREDIT)** | **Not modelled.** |
| Manual stock adjustment | **ManualJournal** (inventory ↔ adjustment expense) | **Gaps:** no cost on movement (value at current cost only); no write-off or scrap reason codes. |
| Stocktake applied | **ManualJournal** (shrinkage) | **Gaps:** value at current cost only. Approver, date and per-line reason are present. |
| Opening stock | **ManualJournal** (opening balance) | **Gaps:** as stocktake; opening-stock receipts may carry cost. |
| Component cost change | **ManualJournal** (revaluation) | **Not modelled.** Cost overwritten with no history. |
| Labour time entry | **ManualJournal** (wages → WIP/COGS absorption) | **Ready for labour cost** (frozen hours × rate). Overhead and other actuals are copied from plan; there is no WIP account flow. |
| Production start → WIP; completion → FG | **ManualJournal** (raw → WIP → FG) | **Not modelled.** No production order, no consumption, no FG stock, no WIP value. |
| Shopify order created | **Sales invoice (ACCREC)** | **Gaps:** no tax, discounts, shipping, currency, customer or payment status; lines merged per variant. A2X or Shopify's connector already covers revenue, so **do not build** [inference]. |
| Manual order | Sales invoice (ACCREC) | **Not modelled** in the current UI (no create path). |
| Order fulfilled, **retail** line | **ManualJournal** (Dr COGS / Cr Inventory) | **Gaps:** quantity recorded per line (`sale` movement); cost = current, not frozen; overlap risk with A2X COGS. |
| Order fulfilled, **manufactured** line | **ManualJournal** (COGS) | **Gaps (severe):** no consumption recorded; estimate only from `job_cost_snapshot` (not frozen, ignores yield, 1/1,027 coverage) or `dashboard_product_sales`. |
| Refund / customer return | **Credit note (ACCRECCREDIT)** | **Not modelled.** |
| Square sale | ACCREC / COGS journal | **Not modelled.** Connector not built; spec has no money fields. |
| Channel payouts / fees | Bank transaction / Bill | **Not modelled**, by design (strategy doc 3.4: leave to A2X). |

---

## 7. Biggest data gaps, in order

1. **No cost on movements, and no history of cost changes.** This blocks every valuation journal: shrinkage, adjustments, COGS, and a trial balance that agrees with Manuva. The minimal fix is a `unit_cost` (or `value`) column on `inventory_movement`, written at event time [inference].
2. **No consumption or finished-goods model for manufactured goods.** Without it there is no perpetual COGS or WIP for manufacturers, who are the core user. The only COGS available is a BOM estimate at today's cost.
3. **No tax anywhere.** Tax is mandatory for AU/NZ bills and invoices. It needs per-line tax amounts or rates plus a tenant tax-rate mapping (Xero `TaxType` values are tenant-specific).
4. **Supplier invoice fields missing:** invoice number, invoice date, due date, totals, currency. Payment terms are free text.
5. **Currency is undefined in practice.** NZD default against AUD display; nothing stored per transaction.
6. **Low BOM coverage.** Main tenant: 2 active BOMs. COGS from Manuva is empty for most real sales until BOMs (or retail items) cover sold variants.
7. **No customer entity and no refund handling.** Fine if revenue stays with A2X or Square-for-Xero. A blocker if Manuva ever pushes ACCREC.
8. **No mapping or settings store, and the accounting tables are not in prod.** `accounting_connection` and `accounting_sync_event` exist only as a patch.

---

## 8. Prod counts used (aggregate only)

- `orders`: shopify live 667, shopify historical 574, manual 246.
- `order_line`: 1,860 (all priced).
- Fulfilled live lines: 1,027. With an active BOM: 436 (these sit in non-Shopify, manual-order tenants). With a snapshot: 1.
- `job_cost_snapshot`: 32 rows. Most recent dates are 2026-09-29 (1), 2026-09-23 (1) and 2026-05-12 (20).
- Main store's last syncs report `plan_runs 0 / plan_errors 467`. These are the by-design "No active BOM" refusals: 1 of 738 live lines has a BOM. The sync counts each one as an error.
- `purchase_order` 41 (last 2026-05-23); `purchase_order_line` 93 (all with `unit_cost`); `delivery_receipt` 9 / lines 32 (all with `cost_per_unit`).
- `stocktake_session` 10 (7 completed full, 1 initial in counting); `job_actual_time_entry` 23.
- `tenant.currency`: NZD 4, AUD 3. Column default `'NZD'`, timezone default `'Pacific/Auckland'`.
- `inventory_balance` vs ledger: 114/129 on-hand match; all 15 mismatches are in tenant `a0000001…`.
