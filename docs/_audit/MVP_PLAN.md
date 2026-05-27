# Assemblio — MVP Ship Plan

Detailed plan for bringing Assemblio to a shippable MVP state. Scoped to what a paying customer needs to run their Shopify+BOM+inventory workflow end-to-end without data corruption, security gaps, or dead-end UX.

Effort legend: **S** ≤ 1d · **M** 1–2d · **L** 3–5d · **XL** > 1wk.

---

## 1. MVP Definition

**MVP = "one paying tenant can run live production for 30 days with no data corruption, no cross-tenant leaks, and no flow they can't complete in the UI."**

### In-scope user journeys
1. Admin signs up (email domain → tenant) and logs in.
2. Admin connects Shopify store via OAuth; products, variants, and last-90-days orders import.
3. Admin creates components, defines reorder points, groups them.
4. Admin creates a BOM (from scratch, template, or copy) for each variant they sell; activates one per variant.
5. New Shopify orders auto-reserve components via the allocation engine; cancellations auto-release; fulfillments auto-consume.
6. Admin runs manual stock adjustments, stocktake sessions, and applies them.
7. Admin creates suppliers, issues POs with cost/date, receives them (partial or full) via goods-inwards.
8. Admin sees inventory at a glance: on_hand, reserved, available, low-stock alerts.
9. Admin sees operational integrity status (no drift, no over-receipt, no duplicate allocations).
10. Admin can recover from mistakes via trash (restore BOM/PO/stocktake).

### Explicitly NOT in MVP (feature-flagged off or deleted)
- **Entire planning domain**: `/app/costing`, `/app/capacity`, `/app/actual-time`, `/app/staffing`, `/app/departments`, `/app/staff-costings`. Hide behind `NEXT_PUBLIC_ENABLE_PLANNING`.
- Multi-location allocation (single default location is the contract).
- Barcode/scan workflows.
- Printable PO / GRN documents (PDF).
- Supplier performance analytics.
- CSV bulk imports.
- Advanced reporting, drill-downs, charts beyond what `/app/reports` already shows.
- Shopify inventory level display (`read_inventory` scope).
- Refund webhook partial-refund nuance (full cancel = full release is enough for MVP).

---

## 2. Blocker inventory

Items are grouped by category. Each has a concrete problem statement, fix, acceptance criteria, and effort. Items marked 🚨 are ship-blocking correctness or security; 🟠 are ship-blocking UX or operability; 🟡 are polish that can slip but would cost support tickets.

### A. Ledger correctness (🚨 all ship-blocking)

#### A1. Reservation ledger writes into the wrong column — **L, 4–5d**
**Problem:** `src/lib/allocation/engine.ts:66-75` computes `deltaOnHand` for reservation movements because the schema has no `delta_reserved` column (`supabase/schema.sql:277-278`). `src/lib/allocation/reconcile-order.ts:90-100` inserts that movement, then only updates `inventory_balance.reserved` (not `on_hand`). Result: `sum(delta_on_hand)` no longer matches `inventory_balance.on_hand` after any allocation. The existing reconciliation check (`src/lib/inventory/reconciliation.ts`) will fire on every order.

**Fix:**
1. Migration: `alter table inventory_movement add column delta_reserved numeric not null default 0;`
2. Backfill: for movements where `reason in ('order_reserve','order_release')`, set `delta_reserved = delta_on_hand`, then zero out `delta_on_hand`.
3. Extend `apply_inventory_movement` RPC with `p_delta_reserved numeric` parameter; update `inventory_balance.reserved` inside the RPC.
4. Rewrite `buildReservedMutation` to return `{ deltaReserved, deltaOnHand: 0, reason }`.
5. Rewrite `updateReservedWithMovement` to call the RPC instead of INSERT + UPDATE.
6. Extend `src/lib/inventory/reconciliation.ts` to include `delta_reserved` in its comparison.
7. Add regression test: allocate 100 orders, run integrity audit, zero drift.

**Acceptance:** After running a suite of 100 allocations and 50 cancellations, `ops:integrity` reports zero reconciliation drift. All reservation movements have `delta_on_hand = 0, delta_reserved = ±qty`.

**Dependencies:** Blocks A2 atomicity work (both should share the new RPC).

---

#### A2. Reserved-path is not atomic with its movement — **M, 2d** (combine with A1)
**Problem:** Even after A1, `updateReservedWithMovement` still does INSERT then UPDATE in two round-trips. A crash between them leaves the ledger and balance inconsistent.

**Fix:** Consolidate into the RPC in A1 step 3. No separate TS UPDATE.

**Acceptance:** Killing the DB connection mid-call leaves either both writes committed or neither. Reconciliation check passes after simulated failures.

---

#### A3. Stocktake `Apply` is non-atomic and swallows errors — **M, 2d**
**Problem:** `src/app/app/stocktake/actions.ts:246-300` loops once per variance calling `applyInventoryMovement`, then updates session status separately, and `catch {}`'s mid-loop errors (`:269`). Partial failure → session stuck in `approved` with half the movements applied; operator sees success.

**Fix:**
1. Write `apply_stocktake_session(p_session_id uuid)` PL/pgSQL RPC:
   - Lock session `for update`, assert `status='approved'`.
   - Loop `stocktake_line`, compute `counted - current_on_hand`, call internal `_apply_inventory_movement` per non-zero variance.
   - Update session `status='completed', applied_at=now()`.
   - Insert `activity_log` row with adjustment totals.
2. Replace TS loop with single RPC call.
3. Remove `catch {}`, return error to UI as toast.
4. Test: inject a failure on line 5 of 10, verify neither movements nor status changed.

**Acceptance:** Apply is transactional. Errors surface to UI. Re-running an already-applied session errors explicitly.

---

#### A4. Fulfilled-order consumption is missing — **L, 3–4d**
**Problem:** `reconcile-order.ts:216-224` releases reservations when order hits `fulfilled`, but never decrements `on_hand`. Components physically shipped stay counted in stock.

**Fix:**
1. Extend `order_component_allocation` with `status text` (see A5).
2. On order transition to `fulfilled`:
   - For each active allocation: call `apply_inventory_movement` with `delta_on_hand = -reserved_qty, delta_reserved = -reserved_qty, reason='order_consume', reference_type='order', reference_id=order_id`.
   - Update allocation row: `status='consumed', consumed_at=now()`.
3. Ensure the fulfillment path is idempotent via event_log (see A7).
4. Define what "fulfilled" means: Shopify `fulfillments/create` webhook is the source of truth for MVP.

**Acceptance:** After Shopify fulfills an order: `reserved` drops to 0, `on_hand` drops by BOM-required qty per component, allocation rows show `status='consumed'`. Re-firing the webhook is a no-op.

---

#### A5. `order_component_allocation` has no status column — **M, 2d** (combine with A4)
**Problem:** Releases are implemented by DELETE (`reconcile-order.ts:158-164`). No audit trail of reservations that existed and were returned. Blocks the consumption flow in A4 (can't mark consumed if row is gone).

**Fix:**
1. `alter table order_component_allocation add column status text not null default 'active' check (status in ('active','released','consumed'))`.
2. Replace `clearLineAllocations` DELETE with `update ... set status='released', released_at=now()`.
3. All "active allocations" queries filter `where status='active'`.
4. Upsert on allocate: `on conflict ... do update set required_qty=excluded.required_qty, status='active', released_at=null, consumed_at=null`.

**Acceptance:** Cancelled and fulfilled orders retain their allocation rows with non-active status; reports can reconstruct full lifecycle.

---

#### A6. Active-BOM-per-variant invariant not enforced in DB — **S, 0.5d**
**Problem:** App code in `setBomActive`/`createBom` deactivates siblings, but a concurrent race or direct DB write can create two active BOMs. Engine's `.maybeSingle()` then errors.

**Fix:** `create unique index product_bom_one_active_per_variant on product_bom (tenant_id, variant_id) where is_active;`

**Acceptance:** Inserting a second active BOM raises a DB error; concurrent `setBomActive` calls serialize and one fails.

---

#### A7. Per-order allocation idempotency via event_log — **M, 2d**
**Problem:** Manual "allocate" button (`orders/page.tsx:213`) and webhook-triggered sync both call `reconcileOrderAllocations` with no idempotency guard. Rapid double-click or webhook race can over-reserve; FLOWS.MD §76-80 specifies `event_log` keyed on `shop+topic+shopify_order_id+payload_hash` as the contract.

**Fix:**
1. Compute idempotency key at the call site (button click gets a synthetic key; webhook uses the doc formula).
2. Before reconciling, `select 1 from event_log where idempotency_key = $1`; if present, short-circuit.
3. After successful reconcile, insert into `event_log` with the key.
4. Wrap the whole reconcile in a per-order `pg_advisory_xact_lock(hashtext(order_id))` to serialize concurrent calls.

**Acceptance:** Firing 10 identical webhooks in 1 second produces exactly one set of movements and allocations.

---

### B. Tenancy & security (🚨 all ship-blocking)

#### B1. `bom_template` / `bom_template_line` have no RLS policies — **S, 0.5d**
**Problem:** Tables defined at `supabase/schema.sql:243-258` with `tenant_id` column, but omitted from RLS loops at `schema.sql:564-611` and `patches/multi_tenant_access_and_super_admin.sql:129-166`. Authenticated users read/write cross-tenant via anon key today.

**Fix:** Add both tables to the dynamic loop; apply `_tenant_isolation` policy (same as other tables).

**Acceptance:** Regression test — user authenticated as tenant A queries `bom_template` rows owned by tenant B via the anon key and receives zero rows.

---

#### B2. `current_tenant_id()` trusts stale `profiles.tenant_id` — **M, 1–2d**
**Problem:** `patches/multi_tenant_access_and_super_admin.sql:15-22` reads `profiles.tenant_id` directly. If a user's access is revoked in `profile_tenant_access` but `profiles.tenant_id` is stale, RLS still grants access at the SQL layer (app layer is protected by `getServerTenantContext`, but direct PostgREST calls aren't).

**Fix option A (preferred):** Modify `current_tenant_id()` to join against `profile_tenant_access`:
```sql
create or replace function public.current_tenant_id() returns uuid as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and exists (
      select 1 from public.profile_tenant_access pta
      where pta.profile_id = p.id and pta.tenant_id = p.tenant_id
    )
$$ language sql stable security definer;
```
**Fix option B:** Move `tenant_id` to JWT `app_metadata`; update Supabase auth hook.

**Acceptance:** Revoke a user's `profile_tenant_access` row; their subsequent direct PostgREST queries return zero rows even if `profiles.tenant_id` is unchanged.

---

#### B3. RLS coverage regression guard — **S, 1d**
**Problem:** Next new table will forget RLS just like `bom_template` did. No CI check.

**Fix:** Add `scripts/check_rls_coverage.mjs`:
- Connects via service role.
- Queries `information_schema.tables` + `pg_policies` for the `public` schema.
- For each table with a `tenant_id` column, assert at least one policy exists referencing `current_tenant_id()` or `is_super_admin()`.
- Exit non-zero if any fail.
- Add to CI workflow.

**Acceptance:** CI fails if a new table with `tenant_id` lacks a policy.

---

#### B4. Scope validation at OAuth callback — **S, 0.5d**
**Problem:** Callback stores whatever scopes Shopify granted; doesn't verify they match `REQUIRED_SYNC_SCOPES`. Merchant can install with partial scopes and hit cryptic sync errors later.

**Fix:** In `src/app/api/shopify/callback/route.ts`, after token exchange: compute `granted - required`; if non-empty, reject install with a clear error page.

**Acceptance:** Installing with `read_products` only (missing `read_orders`) fails the callback with a named error.

---

#### B5. Guard against accidental Shopify write scopes — **S, 0.5d**
**Problem:** Policy says read-only; no runtime assertion.

**Fix:** Add a unit test that asserts `REQUIRED_SYNC_SCOPES` contains no `write_*` entries and the parsed `SHOPIFY_SCOPES` env also contains none at startup. Fail fast in module load if violated.

**Acceptance:** Adding `write_inventory` to env breaks the app at startup with a clear error.

---

### C. Shopify integration (🚨 ship-blocking)

#### C1. Explicit ORDERS_CANCELLED release handler — **M, 2d**
**Problem:** Topic is registered; handler just runs full store resync. Cancel-release flow works only by side-effect of sync mapping.

**Fix:** In `src/app/api/shopify/webhooks/route.ts`:
1. Switch on `topic`: on `orders/cancelled`, parse payload, upsert that single order with `status='cancelled'`, then call `reconcileOrderAllocations(orderId)`.
2. Test: post a cancellation payload to the webhook route; verify allocations for that order transition to `status='released'` and `reserved` drops.

**Acceptance:** Cancelling an order in Shopify releases all its reservations within 30s with no full-store sync.

---

#### C2. REFUNDS_CREATE topic + handler — **M, 2d**
**Problem:** `refunds/create` is not registered. FLOWS.MD treats full refund as equivalent to cancellation.

**Fix:**
1. Add `REFUNDS_CREATE` to `src/lib/shopify/client.ts` topic list.
2. Handler: on `refunds/create`, parse payload; if `transactions[].kind='refund'` totals ≥ order total, treat as cancel (release allocations). Partial refund = no-op for MVP.
3. Re-install webhooks on existing stores (migration or manual).

**Acceptance:** Full refund triggers allocation release.

---

#### C3. Fulfillments webhook consumption handler — **M, 2d** (part of A4)
**Problem:** `ORDERS_FULFILLED` is registered but nothing consumes stock.

**Fix:** Add `FULFILLMENTS_CREATE` topic (more granular than `ORDERS_FULFILLED`; fires on partial fulfillments). On receipt, compute consumed qty per line, call allocation consumption path (A4).

**Acceptance:** Shopify fulfillment decrements `on_hand` correctly; reservations release.

---

#### C4. Per-order webhook processing (not full-sync) — **M, 2d**
**Problem:** `webhooks/route.ts:84-127` routes every order-related webhook through `syncShopifyStoreData`, which resyncs everything. Write amplification; race surface; violates FLOWS.MD per-order idempotency intent.

**Fix:** Extract per-order upsert logic from `src/lib/shopify/sync.ts` into a `upsertShopifyOrder(order)` helper. Webhook handlers call it with the single order from the payload, then `reconcileOrderAllocations` with A7's idempotency key.

**Acceptance:** `orders/create` webhook for order X does not touch any order other than X.

---

#### C5. Concurrent sync + webhook lock — **M, 2d**
**Problem:** Manual `/api/shopify/sync` POST and webhook-triggered sync can race on the same store.

**Fix:** At the top of both code paths, acquire `pg_advisory_xact_lock(hashtext('shopify_sync:' || tenant_id::text))`. Or use an `is_syncing` boolean + `sync_started_at` timestamp on `shopify_store` with a 5-minute timeout.

**Acceptance:** Two simultaneous sync triggers serialize; neither corrupts state.

---

#### C6. Rate-limit handling — **M, 1–2d**
**Problem:** `shopifyGraphqlRequest` does not handle 429 / Retry-After. Sync of a busy store fails.

**Fix:** Wrap request: on 429 or `extensions.cost.throttleStatus.currentlyAvailable < required`, parse `Retry-After` header (or compute from `extensions.cost`), sleep, retry up to 5 times with exponential backoff.

**Acceptance:** Inject a 429 response — client retries and completes.

---

#### C7. Shopify location sync — **M, 2d**
**Problem:** No import of Shopify locations; all allocations go to tenant default regardless of order fulfillment location. MVP uses single default, but the `location` table must at least be populated so admins can pick one.

**Fix:**
1. Add locations query to sync: `GraphQL locations(first:50) { id name }`.
2. Upsert into `location` keyed on `(tenant_id, shopify_location_id)`.
3. Ensure at least one is marked `is_default=true` (first imported if none exists).

**Acceptance:** Settings page shows all Shopify locations; one is marked default.

---

### D. Domain operations (🟠 ship-blocking UX/operability)

#### D1. PO status lifecycle state machine — **S, 1d**
**Problem:** `src/app/app/purchasing/actions.ts:48-66` accepts any status string. Users can flip `received → open` and re-receive.

**Fix:**
1. Create `src/lib/purchasing/lifecycle.ts` with allowed transitions, mirroring `src/lib/stocktake/lifecycle.ts`.
2. Add `check (status in ('open','in_transit','received','cancelled','archived'))` constraint.
3. Server action rejects invalid transitions; UI hides invalid options.

**Acceptance:** Attempting `received → open` fails server-side and UI hides the option.

---

#### D2. PO line: unit cost + expected date — **S, 1d**
**Problem:** `purchase_order_line` only has quantity. Can't compute inventory value or forecast delivery.

**Fix:**
1. Schema: `alter table purchase_order_line add column unit_cost numeric, expected_date date`.
2. UI: add fields to `po-line-form.tsx`.
3. Currency is implicit per-tenant for MVP (add `tenant.currency` default).
4. Display extended cost on PO detail.

**Acceptance:** Create PO line with cost/date; displayed on list and detail.

---

#### D3. Supplier model + supplier-component link — **M, 2–3d**
**Problem:** `suppliers` is name-only. No way to know which supplier sells which component, no lead time, no contact.

**Fix (minimal for MVP):**
1. Schema: add to `suppliers`: `contact_email text, lead_time_days int, is_active bool default true`.
2. New table `component_supplier (tenant_id, component_id, supplier_id, supplier_sku, unit_cost, is_primary bool)` with unique `(component_id, supplier_id)` and partial unique on `(component_id) where is_primary`.
3. UI: supplier form extensions; component detail shows primary supplier and cost.
4. PO line create auto-fills `unit_cost` from `component_supplier.unit_cost` where supplier matches.

**Acceptance:** Can create PO for supplier S and component C pre-filled from the link row.

---

#### D4. Goods-inwards: operator location + no-default error — **S, 1d**
**Problem:** Receive is hard-coded to `is_default=true` location; silent return if none.

**Fix:**
1. Add location selector to receive form; default to tenant default.
2. If no default location and none selected, return an explicit error.
3. Propagate error to UI toast.

**Acceptance:** Tenant with no default sees error; tenant with multiple locations can pick at receive time.

---

#### D5. Bulk-receive atomicity — **M, 2d**
**Problem:** `goods-inwards/actions.ts` loops over lines calling RPC per line. Mid-loop failure leaves PO half-received.

**Fix:** Write `receive_purchase_order(p_po_id uuid, p_location_id uuid)` RPC that loops inside a single transaction, returning `{received_count, failed_lines[]}`. Replace TS loop.

**Acceptance:** Inject failure on line 3 of 5; no movements commit.

---

#### D6. PO line delete (for over-ordered lines) — **S, 0.5d**
**Problem:** Once added, a line can only have `quantity` updated down to `quantity_received`. Can't zero an over-ordered line.

**Fix:** Add `deletePurchaseOrderLine` server action guarded by `quantity_received = 0`. UI button with confirmation.

---

#### D7. Missing-BOM order visibility — **S, 1d**
**Problem:** `reconcile-order.ts:237-256` silently skips order lines with no active BOM. Operator has no idea why allocation shows 0.

**Fix:**
1. On skip, write `activity_log` entry with `event='allocation_missing_bom', metadata={order_id, order_line_id, variant_id}`.
2. Add `order_line.needs_bom bool default false`; set true when skipped, false on successful allocate.
3. Orders list column: `N lines need BOM`.
4. Dashboard metric: "Orders needing BOM: N".

**Acceptance:** Syncing an order for a variant with no BOM: order appears in list with "needs BOM" badge; activity log records the skip.

---

#### D8. Activity log population — **M, 2d**
**Problem:** Table exists with RLS, no inserts. No audit trail.

**Fix:** Add activity_log inserts at:
- `bom/actions.ts`: createBom, setBomActive, archiveBom
- `purchasing/actions.ts`: createPO, updatePOStatus, createPOLine, updatePOLineQty
- `components/actions.ts`: create, update, archive
- `orders/actions.ts`: already has allocation log — keep
- `stocktake/actions.ts`: create, submit, approve, apply (apply already present)
- `goods-inwards/actions.ts`: already present — verify actor_id
- `suppliers/actions.ts`: create, update
- All entries must include `actor_id = auth.uid()`, `event` (kebab-case name), `metadata` (affected IDs + deltas).

**Acceptance:** After walking through all MVP flows, every state-changing action has a corresponding `activity_log` row with non-null actor.

---

#### D9. Inventory movement history page with filters — **M, 2d**
**Problem:** `/app/inventory` shows 8 rows; no search, no filter, no date range, no export for movements.

**Fix:** Add `/app/inventory/movements` route:
- Filter controls: component (select), location (select), reason (enum), date range, reference_type.
- Table: 50 rows per page with cursor pagination.
- CSV export button (extend existing `/app/inventory/export`).

**Acceptance:** Find any movement in last 90d within 5 seconds.

---

#### D10. Component detail edit form — **S, 1d**
**Problem:** `/app/components/[componentId]` is read-only.

**Fix:** Add edit form: name, unit, reorder_point, primary_supplier, notes. Server action with validation. Update reflected on list after save.

**Acceptance:** Change reorder point from 10 to 20; list shows new threshold; low-stock alert behaviour updates.

---

#### D11. Inventory movement reference validation — **S, 0.5d**
**Problem:** `movement-form.tsx:112-118` accepts arbitrary `reference_type`/`reference_id` text.

**Fix:** Constrain `reference_type` to enum `['manual_adjustment','receipt','stocktake_adjustment','order_reserve','order_release','order_consume','transfer']`. Validate `reference_id` is a UUID when non-null.

**Acceptance:** Submitting bogus reference_type fails validation.

---

#### D12. BOM activation validation — **S, 0.5d**
**Problem:** `setBomActive` doesn't require the BOM have ≥1 line.

**Fix:** In server action, query count of `product_bom_component` for the BOM; reject if zero with a clear error.

**Acceptance:** Activating an empty BOM fails.

---

#### D13. Status field CHECK constraints — **S, 1d**
**Problem:** `orders.status`, `product_bom.status`, `purchase_order.status` are all free-text. Engine case-matches on `'fulfilled'/'cancelled'` (`reconcile-order.ts:216-218`); whitespace or casing strands reservations.

**Fix:** Add CHECK constraints:
- `product_bom.status in ('draft','active','archived')`
- `orders.status in ('open','fulfilled','cancelled','refunded')` (adjust to your Shopify mapping)
- `purchase_order.status` per D1

Normalize all writes to lowercase trim.

**Acceptance:** `cancelled ` with trailing space fails at the DB; engine logic becomes robust.

---

#### D14. Stocktake: `in_prod` variance handling — **S, 1d**
**Problem:** `stocktake/actions.ts:264` always passes `deltaInProd: 0`.

**Fix:** Add counted_in_prod column to `stocktake_line`; apply computes `counted_in_prod - current_in_prod`; RPC writes both deltas.

**Acceptance:** Stocktake that adjusts in_prod shows the movement.

---

#### D15. Stocktake: unique `(session_id, component_id, location_id)` — **S, 0.5d**
**Problem:** No constraint; same component can be counted twice.

**Fix:** `create unique index on stocktake_line (session_id, component_id, location_id)`.

---

#### D16. Pagination on core list pages — **S total 2d**
**Problem:** Hard-coded `.limit(8|12|20)` on inventory, stocktake, purchasing, goods-inwards, BOM, orders.

**Fix:** Add cursor pagination (Supabase `.range()`). 50 per page. Keep list responsive.

**Acceptance:** Tenant with 500 orders can page to the oldest.

---

### E. UI completeness (🟠 ship-blocking for MVP polish)

#### E1. Sidebar matches README app surface — **S, 0.5d**
**Problem:** UI audit flagged sidebar as omitting README-promised Inventory, BOM, Purchasing, and Help surfaces.

**Fix:** Audit `src/app/app/layout.tsx` (or wherever the nav lives); add missing entries. Confirm icons, labels, active-state styling match existing nav items.

**Acceptance:** Every `/app/*` route listed in README is reachable from the sidebar in one click.

---

#### E2. Feature-flag the planning domain OFF — **S, 0.5d**
**Problem:** `/app/costing`, `/app/capacity`, `/app/actual-time`, `/app/staffing`, `/app/departments`, `/app/staff-costings` are partial/stub and visible. They make the app look unfinished.

**Fix:**
1. Add env flag `NEXT_PUBLIC_ENABLE_PLANNING=false`.
2. Conditionally render their nav entries.
3. Route guards: each page returns 404 if flag is off.
4. Delete `/app/staff-costings` entirely (it's a redirect stub).

**Acceptance:** MVP tenant sees only the core 11 routes.

---

#### E3. Trash: restore actions for BOM / PO / stocktake — **S, 1d**
**Problem:** Trash page is partial — items listed but restore not wired for all entity types.

**Fix:** For each entity, add a `restore<Entity>` server action that flips `status='archived'` back to its default. Wire button in trash.

**Acceptance:** Archiving then restoring a BOM, PO, and stocktake all work from trash UI.

---

#### E4. Error surfacing on silent catches — **S, 0.5d each, 1.5d total**
**Problem:** Silent `catch {}`/`if (error) return;` at:
- `src/app/app/stocktake/actions.ts:269`
- `src/app/app/goods-inwards/actions.ts:83-85,153-155`

**Fix:** Return structured error result to client; render toast.

**Acceptance:** Injecting a DB error in any of these paths shows the operator a toast, not silent success.

---

### F. Release checklist & testing (🟠 ship-blocking)

#### F1. End-to-end test suite — **L, 4–5d**
**Problem:** Only pure-function unit tests exist. No integration coverage of reconcile, stocktake apply, or goods-inwards RPC.

**Fix:** Build a Supabase-integration test suite (Vitest + local Supabase) covering:
1. Sign up → tenant resolved from email domain.
2. Connect Shopify (mocked GraphQL client).
3. Initial sync: 10 products, 20 variants, 5 orders imported.
4. Create 15 components; create BOM for each variant from template; activate.
5. Auto-allocate on order sync: verify allocations, reservations, no drift.
6. Cancel one order (webhook): verify release + status transition + event_log.
7. Fulfill another (webhook): verify consumption, on_hand decrement, event_log.
8. Create PO with 3 lines; partial receive 1 line; full receive another; cancel last.
9. Create stocktake session, submit, approve, apply; verify variance movements.
10. Run `ops:integrity` — assert zero drift.
11. Run RLS coverage check — assert all policies present.

Target: run in CI under 5 minutes.

**Acceptance:** Suite passes green 10 runs in a row. Any regression in ledger correctness fails it.

---

#### F2. Runbook & docs refresh — **S, 1d**
**Problem:** `PLANNING.MD` describes an unrelated CLI product. Docs reference fields that don't exist in schema (`quantity_per_unit`, `sort_order`, `updated_at` on `product_bom_component`).

**Fix:**
1. Delete `PLANNING.MD` or replace with the MVP plan.
2. Reconcile `DATA_MODEL.MD` with actual schema (rename `quantity_per_unit → quantity`, remove non-existent columns, or add them if planned).
3. Update README "App Surface" to reflect feature-flagged routes.

---

#### F3. Operational runbook — **S, 1d**
**Problem:** No documented procedures for: new tenant onboarding, drift remediation, webhook retry.

**Fix:** Add `docs/RUNBOOK.md` covering:
- Provisioning a new tenant (tenant + tenant_domain + default location + admin user).
- What to do if `ops:integrity` fails.
- How to re-register Shopify webhooks after migration.
- Super-admin escalation procedure.

---

## 3. Effort roll-up

| Category | Items | Total |
|---|---|---|
| A. Ledger correctness | A1–A7 | 15.5d |
| B. Tenancy & security | B1–B5 | 4.5d |
| C. Shopify integration | C1–C7 | 13d |
| D. Domain operations | D1–D16 | 18.5d |
| E. UI completeness | E1–E4 | 3d |
| F. Release checklist | F1–F3 | 7d |
| **Total** | **42 items** | **~61.5 engineer-days** |

With 20% buffer for bug surprises and review: **~74 days = 15 engineer-weeks ≈ 3.5 months** of single-engineer focused work.

**Parallelisable to ~2 months with 2 engineers**, provided one owns A+C (ledger + Shopify) and the other owns B+D+E (tenancy + domain UX). F (testing) runs alongside from week 2.

---

## 4. Recommended sequencing (12-week plan, 1 engineer)

| Week | Focus | Deliverables |
|---|---|---|
| 1 | Foundation / correctness | A1 + A2 (reservation ledger + atomic reserved path). Ships as a single migration + RPC update. |
| 2 | Continue correctness | A3 stocktake atomic apply. A6 DB-enforce active BOM. A5 allocation status column. |
| 3 | Fulfilled consumption | A4 + A5 consumption flow. A7 allocation idempotency. |
| 4 | Tenancy + security | B1 RLS gap. B2 stale profile. B3 coverage CI. B4/B5 scope guards. |
| 5 | Shopify release/refund | C1 cancel handler. C2 refund. C3 fulfillment. |
| 6 | Shopify robustness | C4 per-order webhook. C5 sync lock. C6 rate limit. C7 location sync. |
| 7 | Purchasing v2 | D1 PO lifecycle. D2 cost+date. D3 supplier+link. D6 PO line delete. |
| 8 | Goods-inwards + inventory | D4 operator location. D5 bulk atomic. D7 missing-BOM visibility. D11 ref validation. |
| 9 | Activity log + auditability | D8 activity_log population everywhere. D12 BOM validation. D13 status constraints. D14/D15 stocktake hardening. |
| 10 | UI polish | D9 movement history. D10 component edit. D16 pagination. E1 sidebar. E2 feature-flag planning. E3 trash. E4 error surfacing. |
| 11 | E2E suite | F1 integration test suite green. Fix any regressions surfaced. |
| 12 | Release prep | F2 docs refresh. F3 runbook. Bug bash. Staging soak. |

---

## 5. Post-MVP backlog (explicitly deferred)

These are worth capturing but not required to ship:

- Multi-location allocation (split + prefer-location rules).
- Barcode / scanner workflows for receiving and stocktakes.
- Printable PO PDFs and goods-received notes.
- Supplier performance dashboards (on-time %, qty variance).
- CSV bulk imports: components, BOMs, stocktakes.
- Advanced reports with drill-down, charts, custom date ranges, export.
- Planning domain: costing, capacity, actual-time, staffing, departments — decide as separate product phase.
- Shopify inventory-level display (read-only, `read_inventory` scope).
- Partial-refund nuance (partial release logic).
- `shopify_webhook_event` tenant scoping (currently global, intentional).
- Webhook retry dashboard.
- JWT claim–based tenant context (B2 option B, if staying with option A for MVP).

---

## 6. Definition of done (MVP gate)

Before ship:
- [ ] All 🚨 items (A, B, C) completed and tests green.
- [ ] All 🟠 items (D, E) completed.
- [ ] F1 E2E suite runs green 10 times in a row.
- [ ] `npm run ops:integrity --tenant Pac-Technologies --no-fail` reports zero issues across 1000+ allocations / 100+ stocktakes.
- [ ] RLS coverage CI green.
- [ ] `DATA_MODEL.MD` matches schema.
- [ ] Runbook published.
- [ ] Planning-domain routes feature-flagged off.
- [ ] One full staging soak with real Shopify store over 5 days.
