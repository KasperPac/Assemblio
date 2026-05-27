## Inventory / Stocktake / Purchasing / Goods-Inwards Audit

Scope: inventory ledger, stocktake sessions/lines, suppliers/purchase-orders, and goods-inwards receiving. Evidence drawn from `src/app/app/{inventory,stocktake,purchasing,suppliers,goods-inwards}/**`, `src/lib/{inventory,stocktake,allocation}/**`, and the Supabase schema + patches. Each subsection lists Shipped / Partial / Missing / Risks with `file:line` evidence and a rough effort size (S / M / L / XL).

### 1. Inventory

#### Shipped
- Single canonical write path via the `apply_inventory_movement` SECURITY DEFINER RPC: inserts an `inventory_movement` row and upserts `inventory_balance` atomically in one PL/pgSQL block. `supabase/schema.sql:613-683`.
- Client wrapper `applyInventoryMovement` centralises all movement calls for TS callers. `src/lib/inventory/movements.ts:18-35`.
- Inventory page shows balances (on_hand / in_prod / reserved, low-stock detection via `component.reorder_point`) and a recent-movement ledger. `src/app/app/inventory/page.tsx:40-320`.
- Manual movement form (with receipt/allocation/adjustment/production presets) posts through `createMovement` server action, which only calls the RPC. `src/app/app/inventory/actions.ts:19-56`, `src/app/app/inventory/movement-form.tsx:21-129`.
- Invariant validation (negative on_hand/in_prod/reserved, over-reservation) and balance ↔ movement reconciliation utilities with tests. `src/lib/inventory/invariants.ts:1-65`, `src/lib/inventory/reconciliation.ts:34-78`, `src/lib/inventory/audit.ts:30-103`, plus `invariants.test.ts`, `reconciliation.test.ts`, `audit.test.ts`.
- CSV export endpoint for balances. `src/app/app/inventory/export/route.ts:12-63`.

#### Partial
- Movement entry is manual/free-form only: no location-filtering by component, no scan-to-move, no helper to flip presets to component-specific defaults. `src/app/app/inventory/movement-form.tsx:21-129`.
- Audit utilities exist in `src/lib/inventory/audit.ts` but are not surfaced in any UI route or scheduled job (no `/app/inventory/audit` page, no API endpoint).
- Movement filters/pagination are absent; the page only shows the last 8 ledger rows. `src/app/app/inventory/page.tsx:54-55`.

#### Missing
- No dedicated reserved-inventory view, no per-location drill-down.
- No component-detail inventory view bound to the audit invariants (reorder alerts shown but no bulk actions).
- No reorder-point recommendation or low-stock report surface beyond the metric count.

#### Risks
- `src/lib/allocation/reconcile-order.ts:79-137` (`updateReservedWithMovement`) bypasses the RPC: it directly INSERTs into `inventory_movement` and then UPDATEs `inventory_balance.reserved`. This is the ONLY code path that mutates `inventory_balance` without going through `apply_inventory_movement`. It is only used for `reserved` (which the RPC does not handle), but it still creates two non-atomic statements against two tables; a partial failure leaves movement and balance out of sync. Consider extending `apply_inventory_movement` to accept `p_delta_reserved` and make the reserved path atomic. Effort: M.
- The movement form accepts arbitrary `reference_type` / `reference_id` text with no validation; bad references poison audit/reconciliation. `src/app/app/inventory/movement-form.tsx:112-118`. Effort: S.
- `inventory_movement` has no index hints surfaced in the audit; large ledgers will slow the reconciliation pass which pulls every movement row in memory. `src/lib/inventory/audit.ts:42-54`. Effort: M (add paginated reconciliation).
- Movement and balance rows are not tenant-scoped in the RPC argument list — the RPC derives tenant from `current_tenant_id()`, so all good — but the direct reserved path in reconcile-order.ts relies on caller-provided `tenantId` and a service-role-like client; verify RLS coverage. `src/lib/allocation/reconcile-order.ts:90-136`. Effort: S.

### 2. Stocktake

#### Shipped
- Table model: `stocktake_session` + `stocktake_line` with tenant_id, status, location_id, expected_on_hand, counted. `supabase/schema.sql:510-518` and session table above.
- `expected_on_hand` snapshot patch applied via `supabase/patches/stocktake_expected_snapshot.sql:1-7`.
- Lifecycle state machine with explicit allowed transitions and editing/apply guards. `src/lib/stocktake/lifecycle.ts:1-33` (tests in `lifecycle.test.ts`).
- Server actions create sessions, create/update lines (only on `open`), change status (guarded by `canTransitionStocktakeStatus`), and apply approved sessions. `src/app/app/stocktake/actions.ts:45-300`.
- Apply path: loads lines + current balances, computes `counted - currentOnHand`, calls `applyInventoryMovement` per variance with reason `stocktake_adjustment` and `reference_type="stocktake_session"`, then flips session status to `completed` and writes an `activity_log` entry with adjustment totals. `src/app/app/stocktake/actions.ts:197-300`.
- Line creation captures an `expected_on_hand` snapshot from the live balance when the line is added, so variance reporting survives concurrent movements. `src/app/app/stocktake/actions.ts:144-160`.
- Stocktake page exposes sessions + lines, status transitions, and an Apply button gated on `canApplyStocktakeSession`. `src/app/app/stocktake/page.tsx:50-237`.

#### Partial
- Apply path is NOT database-atomic. `applyStocktakeSession` loops and issues one RPC per variance, then updates the session status + activity_log in separate statements (`src/app/app/stocktake/actions.ts:246-300`). A mid-loop failure swallows the error (`catch {}` at line 269) and returns, leaving the session still marked `approved` but with some movements already applied.
- Only `open` sessions can edit lines (`canEditStocktakeLines` returns true only for `open`), matching docs, but there's no UI for going back to `open` after `locked` except through the status select; no audit trail of who toggled.
- No pagination/filter on sessions (hard-coded `limit(12)`) or lines (`limit(20)`). `src/app/app/stocktake/page.tsx:58,67`.

#### Missing
- No variance review / approval workflow UI (single manual status dropdown, no "approve selected variance" step).
- No handling of `in_prod` variance: apply path always passes `deltaInProd: 0` (`src/app/app/stocktake/actions.ts:264`). If `in_prod` is counted separately, it is silently dropped.
- No stocktake CSV import / bulk upload; lines must be typed one by one.
- No protection against counting the same `component_id` twice in a session (no unique constraint on (session_id, component_id) in schema, and no dedup in the action).

#### Risks
- Non-atomic apply: partial failure mid-loop leaves movements applied, session status unchanged, no activity log. Wrap the whole apply in a single PL/pgSQL RPC (e.g., `apply_stocktake_session(p_session_id)`) so status flip + all movements commit together. Effort: M.
- Silent catch at `src/app/app/stocktake/actions.ts:269-271` swallows RPC errors — operator sees success in the revalidated page while data is half-applied. Propagate the error or return a state object. Effort: S.
- Expected snapshot is taken at line insert time, but if the balance changes before the session is approved the operator sees stale expected values; consider re-snapshotting at `locked` transition. Effort: S.
- No concurrency protection: two simultaneous applies on the same approved session could double-adjust. Add `status != 'completed'` guard inside the RPC with `for update`. Effort: S.

### 3. Purchasing

#### Shipped
- Tables: `suppliers`, `purchase_order`, `purchase_order_line` with tenant-scoped RLS and received-qty non-negativity + `quantity_received <= quantity` check constraints. `supabase/schema.sql:520-545`, plus `supabase/patches/purchase_order_partial_receiving.sql:1-31`.
- Supplier directory CRUD (create + rename). `src/app/app/suppliers/actions.ts:11-57`, `src/app/app/suppliers/page.tsx:1-69`.
- PO create + status update + line create + line quantity update server actions, all tenant-scoped through `getServerTenantContext`. `src/app/app/purchasing/actions.ts:17-123`.
- Quantity edit guard: cannot reduce `quantity` below `quantity_received`. `src/app/app/purchasing/actions.ts:113-114`.
- Purchasing page renders PO list, PO lines with received display, and inline edit forms. `src/app/app/purchasing/page.tsx:45-201`.

#### Partial
- Supplier model is name-only — no supplier SKU / part number, contact, lead time, MOQ, cost, or status. `supabase/schema.sql:520-525`, `src/app/app/suppliers/supplier-create-form.tsx:1-36`.
- PO line has only `quantity`; no unit cost, expected date, or supplier reference; no currency handling. `supabase/schema.sql:535-545`.
- PO status transitions have no state machine — any value is writeable via the select (Open, In Transit, Received, Cancelled, Archived). `src/app/app/purchasing/actions.ts:48-66`, `src/app/app/purchasing/page.tsx:129-137`. This lets users flip `received -> open` manually, contradicting the RPC's own `in ('received','cancelled','archived')` guard.
- Hard-coded `limit(12)` for orders and `limit(20)` for lines on the purchasing page. `src/app/app/purchasing/page.tsx:53,62`.

#### Missing
- No PO line delete flow — once added, a line can only have its quantity updated down to `quantity_received`.
- No printable / emailable PO document or PDF export.
- No goods-received note (GRN) separate from the inventory movement.
- No supplier-performance reporting (on-time / qty variance) even though the data model would support it.
- No validation that `component_id` is actually supplied by the chosen `supplier_id` (no supplier-component link table).

#### Risks
- Lack of a state machine for PO status: an admin can set a PO back to `open` after the RPC closed it, then it could be re-received — but the RPC also flips the status to `received` each time all lines are fully received, which should contain this. Still, a formal lifecycle module (mirroring `stocktake/lifecycle.ts`) would prevent surprises. Effort: S.
- Line-level delete absence means mistakes accumulate forever; constraint `quantity_received <= quantity` means you can't zero a line that was over-ordered. Add a guarded delete for lines with `quantity_received = 0`. Effort: S.
- Purchase orders and lines hit `purchase_order_line` with `.limit(20)` — unbounded tenants outgrow the view immediately. Effort: S.

### 4. Goods Inwards

#### Shipped
- Dedicated route at `/app/goods-inwards` rendering PO cards with supplier, status, ordered/received/remaining metrics, and per-line receive inputs. `src/app/app/goods-inwards/page.tsx:35-224`.
- Two flows: "Receive remaining" (loops over lines, receiving remaining for each) and per-line partial receive with a `receive_qty` input capped at `remaining.toFixed(2)`. `src/app/app/goods-inwards/page.tsx:144-212`.
- Both flows go through the `receive_purchase_order_line` SECURITY DEFINER RPC, which atomically calls `apply_inventory_movement`, bumps `quantity_received`, and (when all lines are full) transitions the PO to `received`. `supabase/patches/receive_purchase_order_line_rpc.sql:1-93`, duplicated in `supabase/schema.sql:685-775`.
- Over-receipt prevention on three layers: DB check constraint `quantity_received <= quantity` (`supabase/patches/purchase_order_partial_receiving.sql:22-30`), RPC clamp `v_applied := least(greatest(v_remaining, 0), p_receive_qty)` (`supabase/patches/receive_purchase_order_line_rpc.sql:53`), and UI `max={remaining.toFixed(2)}` (`src/app/app/goods-inwards/page.tsx:191`).
- Activity log entries emitted for bulk and per-line receipts with quantity metadata. `src/app/app/goods-inwards/actions.ts:93-103,159-167`.
- Revalidation of `/app/purchasing`, `/app/inventory`, `/app/goods-inwards`, and `/app/activity-log` after each receipt. `src/app/app/goods-inwards/actions.ts:105-108,169-172`.

#### Partial
- Location resolution is fixed to the tenant's `is_default = true` row — no operator choice at receive time. `src/app/app/goods-inwards/actions.ts:26-32`.
- The `getTenantContext()` helper here is duplicated rather than using `getServerTenantContext` from `src/lib/tenant/context.ts` (which is what purchasing/stocktake use). `src/app/app/goods-inwards/actions.ts:18-39`.
- Bulk receive swallows RPC errors silently via `if (error) { return; }` — no user-visible feedback. `src/app/app/goods-inwards/actions.ts:83-85,153-155`.
- No way to record over-receipt, damaged qty, or batch / lot number; the receipt is a single numeric quantity.

#### Missing
- No multi-location receiving (e.g., cross-dock to a different warehouse); all receipts land at default location.
- No GRN document / printable receipt.
- No receiving history on the page — it lists POs awaiting receipt but not past receipts; history must be inferred from `/app/activity-log` or `inventory_movement`.
- No barcode / scanner flow, no partial-closed status (e.g., PO remains `open` even if 90 % received and the supplier won't ship the remainder — only manual flip to `cancelled`/`archived`).
- No "receive to a different location" override input, even though the RPC takes a location parameter.

#### Risks
- The `is_default` location look-up will silently produce no-ops if no default location exists for the tenant. `src/app/app/goods-inwards/actions.ts:26-32`. The whole action just returns, leaving the operator confused. Add an explicit error return. Effort: S.
- Bulk-receive loop on client: it iterates lines and calls the RPC once per line inside a server action, making N round-trips. A tenant-side transaction wrapper (e.g., `receive_purchase_order(p_purchase_order_id, p_location_id)`) would make it atomic and avoid partial-bulk-receipt states when one line fails mid-loop. Effort: M.
- Error swallowing (`if (error) return;`) hides RPC failures that would otherwise indicate misconfiguration (wrong tenant context, closed PO, etc.). Effort: S.

### Cross-domain invariant check

- No code mutates `inventory_balance` without a paired `inventory_movement` insert — confirmed except for the reserved path in `src/lib/allocation/reconcile-order.ts:79-137`, which DOES insert a movement but does so non-atomically against the balance update (risk noted above). All other writes go through `apply_inventory_movement` RPC.
- Stocktake apply DOES emit one `apply_inventory_movement` call per non-zero variance and DOES update the session status, but the two are not atomic (see Stocktake risks).
- PO receiving uses `receive_purchase_order_line` exclusively and the RPC prevents over-receipt via `least(greatest(v_remaining,0), p_receive_qty)`; the DB constraint provides belt-and-braces.

### Top follow-up work, ranked

1. Move reserved-inventory path behind the RPC (or a `p_delta_reserved` extension) to close the last direct `inventory_balance` mutation. Effort: M.
2. Turn stocktake apply into a single `apply_stocktake_session` RPC so status flip + all movements commit atomically; stop swallowing errors. Effort: M.
3. Formalise `purchase_order` status lifecycle module (mirror `stocktake/lifecycle.ts`). Effort: S.
4. Allow operator-selected receive location and add an explicit "no default location" error in `goods-inwards/actions.ts`. Effort: S.
5. Add supplier-component link table + unit cost / lead time on PO lines to unlock proper purchasing analytics. Effort: L.
6. Add pagination/filters to the inventory, stocktake, purchasing, and goods-inwards lists (currently hard-capped at 8-20). Effort: S each.
