## BOM + Allocation Audit

Date: 2026-04-22
Scope: `product_bom` / `product_bom_component` management, `order_component_allocation`, `inventory_movement` reservation ledger, default-location rule (ADR 0003), BOM versioning invariant.

Authoritative contract referenced:
- `docs/FLOWS.MD` lines 62-109 (order-to-allocation flow) and lines 187-197 (reserve/release convention: RESERVE negative delta, RELEASE positive delta; on_hand unchanged).
- `docs/ADR/0003-allocation-location-and-ledger.md.md` (default-location, no split, negative-delta reservations).
- `docs/DATA_MODEL.MD` (exactly 1 active BOM per variant, BOMs versioned, allocations drive reserved).
- `supabase/schema.sql` and `supabase/patches/order_component_allocation_unique.sql`.

---

### BOM management — Shipped / Partial / Missing

SHIPPED
- Versioned `product_bom` header exists with `version`, `status`, `is_active`, FK to `shopify_variant` — `supabase/schema.sql:224-232`.
- BOM lines `product_bom_component` reference `component` with `quantity` — `supabase/schema.sql:234-241`.
- "Set active" action explicitly flips all sibling BOMs for a variant to `is_active=false` before activating the chosen one, so the active-per-variant invariant is preserved through the UI — `src/app/app/bom/actions.ts:123-132`.
- `createBom` also deactivates existing rows for the variant when `is_active` is checked — `src/app/app/bom/actions.ts:55-61`.
- Version auto-increment picks next version when none given — `src/app/app/bom/actions.ts:42-53` and `src/app/app/products/actions.ts:64-79`.
- Versioned creation paths: scratch / from-template / copy-from-existing, all insert as `status=draft, is_active=false` — `src/app/app/products/actions.ts:81-168` (`createBomWithComponents`), `:170-215` (`createDraftBomFromScratch`), `:217-315` (`copyBomToDraft`), `:317-404` (`createBomFromTemplate`).
- RBAC gate on BOM editing (admin / super_admin) — `src/app/app/products/actions.ts:28-62`.
- Reusable `bom_template` + `bom_template_line` tables and management UI — `supabase/schema.sql:243-258`, `src/app/app/bom/templates/*`, `src/app/app/products/template-wizard.tsx`.

PARTIAL
- Active-BOM uniqueness is enforced ONLY by application code. No partial unique index such as `unique (tenant_id, variant_id) where is_active` exists in schema (`supabase/schema.sql:224-232`). Two writers (e.g., concurrent `setBomActive` / `createBom`) or a direct DB write can produce multiple active BOMs per variant. Effort: S.
- `product_bom.status` has no CHECK constraint; only the UI restricts values to `draft|active|archived`, but `createBom` accepts any string (`src/app/app/bom/actions.ts:27`, `:63-69`). Effort: S.
- Doc/data model mismatch: `DATA_MODEL.MD` names the quantity column `quantity_per_unit` and lists a `sort_order` column on `product_bom_component`; actual schema uses `quantity` and has no `sort_order` (`supabase/schema.sql:234-241`). BOM lines therefore have no deterministic ordering. Effort: S (schema) / M (migration + UI).
- BOM lines are unconstrained against duplicate `(product_bom_id, component_id)` rows — `supabase/schema.sql:234-241` has no unique key. `src/app/app/products/actions.ts:131-143` does not dedupe. The allocation engine works around this by summing duplicates (`src/lib/allocation/engine.ts:26-39`), but BOM editing allows the condition to exist. Effort: S.
- Activating a BOM does NOT propagate `status=active` on all three code paths. `createBom` inserts with whatever status was submitted even when `is_active=true`, so an "active, draft" row is possible (`src/app/app/bom/actions.ts:63-69`). Effort: S.

MISSING
- No "publish draft -> active" workflow with validation (cannot confirm the BOM has at least one non-zero-qty line, components all still exist, etc.) before flipping `is_active=true`. Effort: M.
- No archival of lines on variant deletion / product unpublishing; `FLOWS.MD:61` says "BOM retained but flagged" — no flag exists. Effort: S.
- No BOM "buildable quantity" calculator despite `FLOWS.MD:20-30` specifying the algorithm (`floor(componentAvailable / quantity_per_unit)` per line, min across lines). Grep confirms zero implementation (`Grep buildable|buildableQuantity|calculateBuildable` returns no hits). Effort: M.
- No CSV import (UI states "not available in this release" — `src/app/app/products/bom-lightbox.tsx:136-140`). Effort: M (non-critical).
- `product_bom_component` has no `updated_at` column despite `DATA_MODEL.MD:91` listing it. Effort: S.

---

### Allocation engine — Shipped / Partial / Missing

SHIPPED
- Central engine `src/lib/allocation/reconcile-order.ts` is the single point of allocation; invoked by the orders UI (`src/app/app/orders/actions.ts:29-33`, `:180`) and the Shopify sync pipeline (`src/lib/shopify/sync.ts:300-309`).
- Default-location lookup via `location.is_default=true` is done before allocating; if absent, allocation aborts cleanly — `src/lib/allocation/reconcile-order.ts:194-204`.
- Active-BOM filter applied correctly (`.eq("is_active", true)`) — `src/lib/allocation/reconcile-order.ts:228-236`.
- Required quantity computed as `order_line.quantity * bom_component.quantity` per component with duplicate lines summed — `src/lib/allocation/engine.ts:26-39`.
- Upsert into `order_component_allocation` uses the unique key from the patch (`onConflict: "tenant_id,order_line_id,component_id"`) — `src/lib/allocation/reconcile-order.ts:283-291`.
- Reconcile recomputes `delta = required − currentReserved` and issues a paired ledger movement + balance update — `src/lib/allocation/reconcile-order.ts:274-322`.
- Sweeps stale allocations: components previously reserved that are no longer in the BOM/line get deleted with a release movement — `src/lib/allocation/reconcile-order.ts:324-344`.
- On `fulfilled` / `cancelled`, all allocations for the order are cleared and released — `src/lib/allocation/reconcile-order.ts:216-224`, `:139-178`.
- Duplicate-row collapse: on each pass, duplicate allocation rows per component are deleted leaving the primary — `src/lib/allocation/reconcile-order.ts:303-311`.
- `inventory_balance.reserved` is clamped at zero on release — `src/lib/allocation/engine.ts:77-79`.
- Orders list and detail pages expose "Run allocation" and "Allocate and plan" actions — `src/app/app/orders/page.tsx:213-218`, `src/app/app/orders/[orderId]/page.tsx:321-328`, `src/app/app/orders/actions.ts:21-56`, `:165-199`.
- Unit tests cover the pure math helpers — `src/lib/allocation/engine.test.ts`.

PARTIAL
- Reservation ledger convention is WRONG versus ADR 0003 / `FLOWS.MD:187-197`. See "Risks / policy violations" below. Engine wiring works, but the movement it writes is logically incorrect.
- Shopify webhook does not call the allocation engine directly; it falls back to `syncShopifyStoreData`, which runs a full store resync then loops every order through `reconcileOrderAllocations` — `src/app/api/shopify/webhooks/route.ts:92-99` + `src/lib/shopify/sync.ts:300-309`. Per-order idempotency via `event_log` (per `FLOWS.MD:76-80`) is NOT implemented on the allocation side; only the webhook envelope is deduped via `shopify_webhook_event` (`webhooks/route.ts:32-51`). Effort: M.
- Missing-BOM condition increments `skippedMissingBom` but there is no write to `activity_log` or any "needs BOM" flag on the order, contrary to `FLOWS.MD:109`. Only the outer `allocateOrder` caller logs a summary count — `src/app/app/orders/actions.ts:35-44`, `:182-191`. Effort: S.
- Engine reads `order_line.quantity` directly and does not guard against `quantity <= 0` or `NaN` (`src/lib/allocation/reconcile-order.ts:206-214`, `:269-273`). Effort: S.
- Reconcile is not transactional. Between the movement insert and the balance update in `updateReservedWithMovement` (`src/lib/allocation/reconcile-order.ts:90-137`), an error leaves orphan ledger rows with no balance change. Effort: L (needs RPC / Postgres function).
- The allocation upsert uses `onConflict` keyed on `tenant_id,order_line_id,component_id`, matching the patch. However, the `insert` when no row exists happens via `.upsert` with a single row and no `ignoreDuplicates: false` guarantee — if a concurrent webhook + manual allocation race, two rows may be momentarily created before the unique constraint enforces. The sweep at `:303-311` cleans up, but the ledger will already have written two paired movements. Effort: M.

MISSING
- No `order_component_allocation.status` (active / released) column. Releases are implemented by DELETE, so there is no audit trail of a reservation that existed and was returned. `DATA_MODEL.MD:103-111` implies allocations are long-lived; the current implementation is destructive. Effort: M.
- `order_component_allocation` has no `location_id` (`supabase/schema.sql:492-500`) and the engine never writes one; allocation is implicitly against the default location, but nothing in the row records which location was reserved against. This also means if a tenant later changes its default location, reconciling old orders cannot trace back the original reservation. Effort: M.
- No release-on-refund path; `FLOWS.MD:117-129` specifies a refund-webhook release flow. Webhook registry only handles `orders/cancelled` and `orders/fulfilled` (`src/lib/shopify/webhook.ts:1-8`). Effort: S (add topic) + M (payload handling).
- No idempotency check via `event_log` keyed on `shop + topic + shopify_order_id + payload_hash` as specified (`FLOWS.MD:76-80`). Duplicate processing is only prevented by the webhook envelope hash (`x-shopify-webhook-id`), which a manual resync would bypass. Effort: M.
- No "needs BOM" order marker or activity-log row written from the engine on missing-BOM — `src/lib/allocation/reconcile-order.ts:237-256` just increments a counter. Effort: S.
- Allocation engine has NO integration test that drives the database tier end-to-end; only the pure helpers are tested (`engine.test.ts`). The `reconcile-order.ts` logic (~170 lines) is unverified. Effort: M.

---

### Risks / policy violations

1. **Reservation ledger convention violates ADR 0003 and `FLOWS.MD:187-197`.** HIGH.
   - Policy: RESERVE is a NEGATIVE delta on the reservation dimension AND `on_hand` must remain unchanged.
   - Actual: engine writes the negative delta into `delta_on_hand`, not a dedicated reserved column. `buildReservedMutation` sets `deltaOnHand: deltaReserved > 0 ? -deltaReserved : Math.abs(deltaReserved)` — `src/lib/allocation/engine.ts:66-75`.
   - Schema confirms only `delta_on_hand` / `delta_in_prod` exist on `inventory_movement` — `supabase/schema.sql:272-283`. There is no `delta_reserved` column.
   - Consequence: the ledger's `sum(delta_on_hand)` no longer equals `inventory_balance.on_hand` because `reconcileOrderAllocations` only updates `inventory_balance.reserved` and never touches `on_hand`. The movement is an accounting phantom.
   - The inventory audit (`src/lib/inventory/audit.ts:42-82` + `reconciliation.ts`) sums `delta_on_hand` to verify `inventory_balance.on_hand`; every single reserve/release will therefore register as a reconciliation drift once any reserve has been applied. Effort: L — add `delta_reserved` column on `inventory_movement`, migrate, and fix engine to write delta_reserved while leaving delta_on_hand = 0.

2. **Active-BOM invariant not enforced in DB.** MEDIUM.
   - `DATA_MODEL.MD:81` mandates "only 1 active BOM per variant at a time". `product_bom` has no partial unique index (`supabase/schema.sql:224-232`). Any race in `createBom` or `setBomActive` (`src/app/app/bom/actions.ts:55-69`, `:107-133`) can create multiple actives. The engine picks one via `.maybeSingle()` (`reconcile-order.ts:228-236`), which will ERROR — not silently pick — when duplicates exist. Effort: S — `create unique index ... on product_bom (tenant_id, variant_id) where is_active`.

3. **No location_id on allocations.** MEDIUM.
   - `order_component_allocation` lacks `location_id` (`supabase/schema.sql:492-500`); engine computes `locationId` at runtime but never persists it (`reconcile-order.ts:194-204`, `:283-291`). This is consistent with "no split allocation" in ADR 0003, but it means once a tenant's `is_default` flips to a new location the old reservations cannot be released against the correct balance — `updateReservedWithMovement` will push the release movement at the NEW default location, double-debiting reserved on the new balance. Effort: M — add `location_id` to allocation and use the snapshotted value on release.

4. **Positive-delta reservations during release.** MEDIUM.
   - Per policy RELEASE is a POSITIVE delta. The engine's sign mapping via `buildReservedMutation` satisfies the sign convention on the reservation dimension — but because the value is written into `delta_on_hand`, an inventory audit will read a POSITIVE delta_on_hand on release, mimicking a receipt that never occurred. Same root cause as risk 1. Effort: L (shared fix).

5. **Split allocation not possible, but also not guarded.** LOW.
   - ADR 0003 locks single-location allocation; the engine honors this. There is no configuration surface to "prefer location X" beyond `is_default`. No risk introduced, but undocumented assumption should a tenant forget to mark a default. `reconcile-order.ts:199-204` returns a zero-result silently if no default exists — the caller's `activity_log` entry then reports 0 applied with no explanation. Effort: S — explicit error / log entry.

6. **Allocation is destructive on release (no `status` column).** MEDIUM.
   - `clearLineAllocations` DELETEs rows (`reconcile-order.ts:158-164`), so a cancelled order leaves no evidence in `order_component_allocation` that the reservation ever existed. Regulatory/audit trails rely solely on the (currently broken) `inventory_movement` ledger. Effort: M.

7. **`fulfilled` order releases reservations without converting them to consumption.** HIGH (process-level).
   - When an order moves to `fulfilled`, the engine releases reservations (`reconcile-order.ts:216-224`, `:139-178`), which increments `inventory_balance.reserved` toward zero but does NOT decrement `on_hand`. Real-world component consumption is therefore not recorded. There is no "consume" movement; `FLOWS.MD` does not fully specify fulfillment ledger impact, but an operational system expects `on_hand -= required`. Effort: L — define fulfillment consumption flow + ledger rows.

8. **Shopify webhook triggers a full store resync instead of per-order reconciliation.** MEDIUM.
   - `src/app/api/shopify/webhooks/route.ts:84-127` routes every order-related webhook through `syncShopifyStoreData`, which calls `reconcileOrderAllocations` for every order touched during the sync (`src/lib/shopify/sync.ts:300-309`) instead of just the order referenced by the webhook payload. Amplifies write volume and race surface; also bypasses the per-order idempotency contract in `FLOWS.MD:76-80`. Effort: M — parse webhook payload, upsert the specific order, call engine once.

9. **Duplicate BOM component rows allowed.** LOW.
   - No unique on `(product_bom_id, component_id)` (`supabase/schema.sql:234-241`). Engine sums them, but UI (`src/app/app/bom/actions.ts:138-163`, `src/app/app/products/actions.ts:131-149`) permits creating doubles. Effort: S.

10. **`order_line` upsert keyed on `(tenant_id, order_id, variant_id)`** (`supabase/schema.sql:295-305`) means a Shopify order with two lines for the same variant at different prices collapses to one row on sync (`src/lib/shopify/sync.ts:270-298`). This is unrelated to allocation correctness per-component, but distorts `line_sell_price` and downstream cost snapshots — flagging for BOM/allocation-adjacent awareness. Effort: M.

11. **Missing transactional boundary.** MEDIUM.
    - `updateReservedWithMovement` writes movement then balance in two calls (`reconcile-order.ts:90-137`). A failure between them leaves the ledger and balance inconsistent indefinitely. Combined with risk 1, the audit tool will falsely blame reconciliation drift on this instead of on policy. Effort: L — wrap in RPC.

12. **Status string is free-text** on both `product_bom.status` and `orders.status`. The engine case-folds on `"fulfilled"/"cancelled"` (`reconcile-order.ts:216-218`); any typo (e.g., `CANCELLED`, `canceled`, `cancelled ` with trailing space) causes reservations to be retained forever. Effort: S — CHECK constraints / enums.

---

### Summary

- BOM management fundamentals (versioned header, per-variant active flag via app logic, templates, copy flow, RBAC) are shipped. Gaps are primarily schema-level invariants (no partial unique, no line uniqueness, no status check) and the entirely missing buildable-quantity helper.
- The allocation engine's control flow is correct: right BOM lookup, right delta math, right default-location rule, right duplicate-row collapse, uses the patched unique constraint. It is an idempotent-ish reconciliation and is wired into Shopify sync.
- The CRITICAL defect is that reservation movements are written into `delta_on_hand` instead of a dedicated reserved dimension, because `inventory_movement` lacks a `delta_reserved` column. This contradicts ADR 0003 / `FLOWS.MD:187-197`, silently de-couples ledger sums from `inventory_balance.on_hand`, and will be flagged by the existing inventory audit on every allocation. This must be fixed before reservation ledgering can be trusted.
- Secondary correctness issues: no DB-enforced single-active-BOM, destructive releases (no allocation status), full-store resync on every order webhook, no idempotency via `event_log`, no refund webhook wiring, no fulfillment consumption path, and no transactional wrapper around movement+balance writes.
