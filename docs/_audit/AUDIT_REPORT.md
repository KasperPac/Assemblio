# Assemblio — Where We Stand

Consolidated audit, 2026-04-22. Produced by a team of 6 specialist agents comparing `README.md`, `AGENTS.MD`, `docs/**` against the code under `src/**`, `supabase/**`, and `scripts/**`. Full per-domain reports live alongside this file in `docs/_audit/`.

Effort legend: **S** ≤ half-day · **M** ≤ 2 days · **L** ≤ 1 week · **XL** > 1 week.

---

## TL;DR

**The core promise of the product — multi-tenant Shopify-connected inventory with BOM-driven allocation — is built and functionally working in the happy path.** Tenancy, auth, webhook idempotency, the append-only movement ledger, the allocation engine control flow, the partial-receive RPC, and the full operational-integrity surface (Reports UI, Settings card, internal API, CLI) are all shipped.

**However, there is one critical correctness defect that must be fixed before the ledger can be trusted** (see 🔴 item 1 below): reservation movements are written into `delta_on_hand` because the `inventory_movement` schema has no `delta_reserved` column, while only `inventory_balance.reserved` is updated. Every single reservation therefore creates reconciliation drift that the integrity audit itself will (correctly) flag. This silently violates ADR 0003 / FLOWS.MD §§187-197.

**Outside of that, what's left is follow-through:** a handful of atomicity and policy-enforcement hardening items, one clearly-missing Shopify flow (location mapping + refund webhooks), a missing "consume on fulfillment" ledger step, and roughly half the UI surface in "functional but thin" shape. There is no abandoned scaffolding; the gap is between "v1 shippable" and "operations-grade".

**Documentation warning:** `docs/PLANNING.MD` describes a generic CLI/code-generation tool unrelated to anything in the repo. It appears to be a stale artifact from a different project and should be rewritten or deleted. The rest of the docs (README, AGENTS.MD, ARCHITECTURE, FLOWS, DATA_MODEL, ADRs, SHOPIFY.md) are consistent with the code.

---

## Where we stand, by domain

| Domain | Status | Notes |
|---|---|---|
| Tenancy / RLS | 🟡 Partial | 30+ tables on generated isolation policies; `bom_template` + `bom_template_line` missed (cross-tenant leak). `current_tenant_id()` trusts stale `profiles.tenant_id`. |
| Auth & login | ✅ Shipped | Supabase auth, tenant derived from email-domain/profile, super-admin bypass. |
| Shopify OAuth, catalog sync, order ingest | ✅ Shipped | HMAC-verified, idempotent, read-only scopes. |
| Inventory ledger (`apply_inventory_movement` RPC) | ✅ Shipped | Single canonical write path; invariants + reconciliation with tests. |
| BOM management | ✅ Shipped | Versioned, one-active-per-variant enforced, activation flow. |
| Allocation engine | ✅ Shipped | Correct math, default-location-only, tested, uniqueness constraint in DB. |
| Stocktake | 🟡 Partial | Flow complete but apply-loop is non-atomic and swallows errors. |
| Purchasing | 🟡 Partial | PO CRUD + partial-receive RPC work; supplier model is name-only, no lifecycle state machine. |
| Goods Inwards | 🟡 Partial | Receives through RPC cleanly, but default-location-only and bulk-receive is N round-trips. |
| Operational integrity | ✅ Shipped | All 5 checks live across Reports UI, Settings, `/api/internal/integrity`, and CLI. |
| `activity_log` | 🟠 Schema-ready, unused | Table + RLS in place; no inserts anywhere in the app actions. |
| UI surface (28 routes) | 🟡 11 shipped / 13 partial / 2 stub / 2 N/A | Core workflows shipped; planning domain (costing/capacity/staffing/departments) is skeletal. |
| Landing / Login / Help / Dashboard | ✅ Shipped | |

---

## Outstanding work, ranked by impact × effort

### 🔴 High impact — do first

0. **Fix the reservation ledger dimension (policy violation, audit-breaking).** `src/lib/allocation/engine.ts:66-75` writes the reservation delta into `inventory_movement.delta_on_hand` because the schema only defines `delta_on_hand` / `delta_in_prod` (`supabase/schema.sql:277-278`) — there is no `delta_reserved` column. `src/lib/allocation/reconcile-order.ts:90-100` then inserts that movement, but only updates `inventory_balance.reserved` (not `on_hand`). Consequence: `sum(delta_on_hand) != inventory_balance.on_hand` after any reservation — the existing reconciliation check (`src/lib/inventory/reconciliation.ts`) will fail on every allocation, and the ledger genuinely is inconsistent. Fix: add `delta_reserved numeric` to `inventory_movement`, extend `apply_inventory_movement` RPC with `p_delta_reserved`, migrate the engine to write reservations there with `delta_on_hand=0`. **Effort: L.** Combine with item 2.

1. **Make stocktake `Apply` atomic** — the apply path loops per variance RPC, updates session status afterward in a separate statement, and `catch {}`'s mid-loop errors (`src/app/app/stocktake/actions.ts:246-300`, silent catch at :269). A partial failure leaves the session `approved` with half the movements already committed. Wrap in a single `apply_stocktake_session` RPC. **Effort: M.**

2. **Move the reserved-inventory path behind `apply_inventory_movement`** — `src/lib/allocation/reconcile-order.ts:79-137` is the one remaining code path that writes `inventory_movement` and `inventory_balance` in two non-atomic statements. Extend the RPC with `p_delta_reserved` so every balance mutation goes through one atomic RPC. **Effort: M.**

3. **Implement Shopify order-cancelled / refund webhook handling** — topics `ORDERS_CANCELLED` and `ORDERS_FULFILLED` are registered, but there is no dedicated release-on-cancel handler; reliance is on the sync loop's status mapping. FLOWS.MD documents release-on-cancel as a first-class flow. Add explicit reversal logic + `refunds/create` registration. **Effort: L.**

4. **Populate `activity_log`** — table + RLS are ready; no action handler writes to it. Add inserts in `src/app/app/{bom,orders,stocktake,components,goods-inwards,products,trash}/actions.ts` for the key state transitions. **Effort: S.**

4b. **Add a consume-on-fulfillment ledger step.** When an order moves to `fulfilled`, the engine releases reservations (`reconcile-order.ts:216-224`) — meaning `reserved` returns toward zero — but it never decrements `on_hand`. The components the customer actually received are never recorded as consumed. Either (a) convert RESERVE movements to CONSUME on fulfillment (negative on_hand, zero reserved) or (b) introduce a separate `order_fulfillment_consumption` movement. FLOWS.MD does not fully specify this today; treat as a policy gap too. **Effort: L.**

5. **Formalise PO status lifecycle** — any value is currently settable via the select (`src/app/app/purchasing/actions.ts:48-66`), allowing `received → open` toggles that contradict the RPC's own guard. Mirror `src/lib/stocktake/lifecycle.ts`. **Effort: S.**

6. **🔒 RLS gap: `bom_template` and `bom_template_line` have no tenant isolation policies.** Tables defined at `supabase/schema.sql:243-258` with a `tenant_id` column, but they are not included in the isolation loops at `schema.sql:564-611` or `patches/multi_tenant_access_and_super_admin.sql:129-166`. RLS is off by default — authenticated users can currently read/write other tenants' BOM templates via the anon key. Add both tables to the policy loop. **Effort: S.**

7. **🔒 `current_tenant_id()` trusts a possibly-stale `profiles.tenant_id`.** The RLS helper at `patches/multi_tenant_access_and_super_admin.sql:15-22` reads `profiles.tenant_id` directly without re-verifying `profile_tenant_access`. If a user's access is revoked but `profiles.tenant_id` still points at the old tenant, SQL-level RLS still grants access. `getServerTenantContext` covers this at the app layer, but direct REST/PostgREST paths don't go through it. Fix by verifying membership inside `current_tenant_id()` or by moving to a JWT claim. **Effort: M.**

### 🟡 Medium impact — ship next

6. **Shopify location sync** — no import of Shopify locations; all allocations go to tenant default. FLOWS.MD allows this in MVP but it's the blocking gap for multi-warehouse customers. Add GraphQL location fetch + upsert into `location`, expose a location picker on goods-inwards and allocation. **Effort: M (sync) + S (UI).**

7. **Concurrency-safe webhook processing** — duplicate detection happens before processing, so two simultaneous identical webhooks open a race window. Acquire a per-tenant advisory lock during sync, or gate processing by database-level idempotency key. **Effort: M.**

8. **Shopify rate-limit handling** — no Retry-After handling in `shopifyGraphqlRequest`; a rate-limited sync simply fails. **Effort: M.**

9. **Goods-inwards bulk-receive atomicity** — client loops RPCs one line at a time. Wrap in `receive_purchase_order(p_purchase_order_id, p_location_id)` so a mid-loop failure doesn't leave a half-received PO. Also stop the silent `if (error) return;` swallows. **Effort: M.**

10. **Goods-inwards operator-chosen receive location** — RPC already takes a location parameter; UI hard-codes to `is_default=true`. Expose a selector and surface an explicit error when no default location is set. **Effort: S.**

11. **Supplier-component link + cost on PO line** — `suppliers` is name-only, `purchase_order_line` has no unit cost / expected date / currency. Required before supplier-performance or margin analytics become meaningful. **Effort: L.**

12. **Component detail editing** — `/app/components/[componentId]` is read-only; ops team can't change reorder points or supplier without touching the DB. **Effort: L.**

13. **Inventory movement history search/filter** — page caps at 8 rows; no date range, reason filter, or export. Blocks variance investigation. **Effort: M.**

14. **Reports drill-down + date range** — current `/app/reports` is a read-only summary capped at 20 rows; no interactive cells or date picker. **Effort: M.**

15. **Allocation idempotency guard** — manual allocate button (`orders/page.tsx:213`) has no idempotency key; rapid double-click could over-reserve. Guard via `event_log` or DB-level key. **Effort: M.**

### 🟢 Low impact — polish

16. **BOM validation on activation** — `setBomActive` doesn't check the BOM has ≥1 line; empty BOMs can go active. **Effort: S.**
17. **Duplicate counts within a stocktake session** — no unique constraint on `(session_id, component_id)`. **Effort: S.**
18. **Stocktake `in_prod` variance** — apply path always sends `deltaInProd: 0`; if counted, it's silently dropped. **Effort: S.**
19. **PO line delete** — once added, a line can't be removed; constraint blocks zeroing over-ordered lines. **Effort: S.**
20. **Movement reference validation** — `src/app/app/inventory/movement-form.tsx:112-118` accepts free-text `reference_type`/`reference_id` with no validation, poisoning audits. **Effort: S.**
21. **Silent catches** — `goods-inwards/actions.ts:83-85,153-155` and `stocktake/actions.ts:269` swallow RPC errors; surface them as toasts. **Effort: S each.**
22. **Pagination across list pages** — inventory, stocktake, purchasing, goods-inwards, BOM, orders are all hard-capped at 8–20 rows. **Effort: S each.**
23. **Scope-validation on OAuth callback** — stored scopes not verified against required set; install silently succeeds with partial scopes. **Effort: S.**
24. **Webhook-registration error aggregation** — one failing topic leaves others registered silently. **Effort: S.**
25. **Re-snapshot stocktake `expected_on_hand` on `locked`** — snapshot is taken at line-insert; stale values persist through concurrent movements. **Effort: S.**
26. **Constraint tightening** — `order_component_allocation` uniqueness is `(order_line_id, component_id)` but not location; add location if multi-location allocation is ever enabled. **Effort: S.**
27. **DB-enforce single active BOM per variant** — today the "one active per variant" invariant is app-code-only; a direct DB write or concurrent `setBomActive`/`createBom` can violate it, and the engine's `.maybeSingle()` lookup will then error. Add `create unique index on product_bom (tenant_id, variant_id) where is_active`. **Effort: S.**
28. **Tighten free-text `orders.status` / `product_bom.status`** — engine case-matches on `"fulfilled"` / `"cancelled"` strings (`reconcile-order.ts:216-218`); any casing or whitespace variant will strand reservations. Add CHECK constraints / enums. **Effort: S.**
29. **Duplicate BOM component rows allowed** — no unique on `(product_bom_id, component_id)`; engine sums them but UI can create doubles. **Effort: S.**
30. **Webhook triggers full-store resync per order** — `src/app/api/shopify/webhooks/route.ts:84-127` runs a full `syncShopifyStoreData` on every order webhook instead of reconciling just the affected order. Amplifies write volume and race surface. **Effort: M.**
31. **Allocations are destructively deleted on release** — `clearLineAllocations` deletes rows rather than marking a status; no audit trail of reservations that existed and were returned. Add `status` column (active/released) and preserve rows. **Effort: M.**
32. **Doc/schema mismatches in DATA_MODEL.MD** — doc names BOM-line qty column `quantity_per_unit` (schema uses `quantity`), says there's a `sort_order` column (there isn't), and lists `updated_at` on `product_bom_component` (not present). Decide whether to add the columns or correct the doc. **Effort: S.**

### 🔷 UI thin spots (planning domain — biggest visual gap)

The planning-adjacent routes (added at schema level but minimal UI) are the biggest "area that looks unfinished" in the app:

| Route | Status | Effort to operations-grade |
|---|---|---|
| `/app/costing` | partial | M — visual cost builder, re-forecast |
| `/app/capacity` | partial | M — heatmap, forecasting view |
| `/app/departments` | partial | S — rate history, bulk updates |
| `/app/staffing` | partial | M — attendance / time-off / skill matrix |
| `/app/actual-time` | partial | L — form-only today, no list or history |
| `/app/activity-log` | stub | S — filters, search, drill-in |
| `/app/staff-costings` | stub (redirect) | — dead route, decide to delete or implement |
| `/app/trash` | partial | S — granular recovery |
| `/app/bom/templates` | partial | S — UI polish, previews |
| `/app/products/variants/[id]` | partial | M — BOM visual builder |

---

## Rough totals

| Bucket | Count | Est. calendar effort (one engineer) |
|---|---|---|
| High-impact hardening (items 1–5) | 5 | ~2 weeks |
| Medium-impact (items 6–15) | 10 | ~5–6 weeks |
| Low-impact polish (items 16–26) | 11 | ~2 weeks |
| UI thin-spots (planning domain) | 10 | ~4–5 weeks |
| **Total to "operations-grade v1"** | | **~13–15 weeks** |

This assumes the core domains above don't need rework — the audits found no architectural blockers. Hardening items 1–5 are the ones you'd want resolved before onboarding a second tenant with real dollars flowing through.

---

## Risks / policy notes

- **No runtime guard on Shopify inventory writes.** Policy is "read-only", and no write-scope is requested today, but there is no test or assertion that enforces it. Add a unit test that fails if any non-read scope appears in `REQUIRED_SYNC_SCOPES`. **Effort: S.**
- **Fabulous tenant block.** `scripts/integrity_audit.mjs:82` blocks it; confirm equivalent guard exists on any admin path that accepts a tenant slug. **Effort: S to audit.**
- **Missing active-BOM on an order line is silent.** `reconcile-order.ts:239-240` skips the line and clears prior allocations with no surfaced warning. Add activity_log entry + UI indicator. **Effort: S.**
- **`PLANNING.MD` is stale.** It describes a CLI/code-generation product unrelated to Assemblio. Either delete or replace with the current roadmap before it misleads a future contributor. **Effort: S.**

---

## Per-domain source files

- `docs/_audit/01_vision.md` — canonical spec extracted from all 11 doc files
- `docs/_audit/02_shopify.md` — Shopify integration audit
- `docs/_audit/03_bom_allocation.md` — BOM + allocation engine
- `docs/_audit/04_inventory_stocktake_po.md` — inventory / stocktake / purchasing / goods-inwards
- `docs/_audit/05_platform.md` — tenancy / auth / observability / integrity
- `docs/_audit/06_ui.md` — full route-by-route UI surface
