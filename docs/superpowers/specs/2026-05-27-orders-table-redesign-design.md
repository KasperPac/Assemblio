# Orders table redesign — design spec

**Date:** 2026-05-27
**Owner:** Kasper Simonsen
**Reference:** Katana Sales Orders screen (`References/Screenshot 2026-05-27 082156.png`)

## 1. Goal

Replace the current orders list and detail UI with a pipeline-oriented view that surfaces **component readiness, production state, and delivery state** as three discrete pills per order. The redesign also introduces per-source delivery targets so the team can see at a glance which orders are falling behind.

The current orders page communicates only BOM allocation (`Allocated` / `BOM needed`). It does not tell the user whether components are physically available, when missing components are expected to arrive, where the order sits in production, or whether shipping has happened.

## 2. Non-goals

- **No customer table.** `orders.customer_email` remains a string in v1. A future spec can introduce per-customer SLAs.
- **No drag-rank.** Drag handles for manual priority are deferred; default sort is by target ship date.
- **No production progress percentage.** Production pill shows `In progress` without an actual/planned ratio.
- **No per-line packed state.** `Partially packed` and `Packed` pills are v2. v1 delivery is binary: `Not shipped` / `Partially shipped` / `Shipped`.
- **No quotes tab.** The Katana reference shows Quotes / Sales orders; Manuva does not have quotes yet.

## 3. Locked UX decisions

| Decision | Choice |
| --- | --- |
| Fulfillment model | Make-to-order. "In stock" = "components on hand to make this". |
| Partial readiness granularity | Line-level. A line is fully ready or not. Order shows "N of M lines ready". |
| Pipeline columns on the list | Three discrete columns: **Components / Production / Delivery**. |
| Components pill style | State + ETA (`In stock` / `2 of 3 ready · Jun 2` / `Expected Jun 10` / `No ETA`). |
| Scope | Both list page and detail page. |
| Delivery target source | Per order source (`shopify` / `manual`) with a configurable lead-time-in-days. Per-order override allowed. |
| Production states | `Not started` / `In progress` / `Done` / `Cancelled`. No percentage suffix. |
| Delivery states (v1) | `Not shipped` / `Partially shipped` / `Shipped`. Packed concept deferred. |
| Shipped trigger | Auto from Shopify fulfillment status; manual button for non-Shopify orders. |
| Detail page layout | Katana-style tabs: Sales items / Production / Delivery. Persistent header with the three pills above the tabs. |
| Architecture | Inline server-side aggregator (Approach A). One `getOrdersPipelineRollup` helper composes three sibling helpers. |

## 4. Schema changes

Five small additions, each as a separate `supabase/patches/*.sql` file matching the existing project pattern.

### 4.1 `orders.source`

```sql
alter table public.orders
  add column if not exists source text not null default 'shopify'
  check (source in ('shopify', 'manual'));
```

Backfill in the same patch:

```sql
update public.orders
  set source = 'manual'
  where shopify_order_id is null;
```

### 4.2 `orders.target_ship_date`

```sql
alter table public.orders
  add column if not exists target_ship_date timestamptz;
```

Backfill after `order_source_sla` is created and seeded:

```sql
update public.orders o
  set target_ship_date = o.created_at + (sla.lead_time_days || ' days')::interval
  from public.order_source_sla sla
  where sla.tenant_id = o.tenant_id
    and sla.source = o.source
    and o.target_ship_date is null;
```

### 4.3 `order_source_sla` (new table)

```sql
create table public.order_source_sla (
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  source text not null check (source in ('shopify', 'manual')),
  lead_time_days integer not null default 7 check (lead_time_days >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, source)
);
alter table public.order_source_sla enable row level security;
create policy "tenant_isolation_select" on public.order_source_sla
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.order_source_sla
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.order_source_sla
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_delete" on public.order_source_sla
  for delete using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
```

Seed both rows for every existing tenant in the same patch:

```sql
insert into public.order_source_sla (tenant_id, source, lead_time_days)
  select id, 'shopify', 7 from public.tenant
  on conflict (tenant_id, source) do nothing;
insert into public.order_source_sla (tenant_id, source, lead_time_days)
  select id, 'manual', 10 from public.tenant
  on conflict (tenant_id, source) do nothing;
```

### 4.4 `order_line.shipped_at`

```sql
alter table public.order_line
  add column if not exists shipped_at timestamptz;
```

### 4.5 Indexes

```sql
create index if not exists orders_tenant_target_ship_idx
  on public.orders (tenant_id, target_ship_date);
create index if not exists orders_tenant_source_idx
  on public.orders (tenant_id, source);
```

## 5. Data layer: `pipeline-rollup`

A single composer function fetches the data needed for the list page in a small number of batched Supabase queries.

```ts
// src/lib/orders/pipeline-rollup.ts
export type ComponentsState =
  | { kind: "empty" }
  | { kind: "in-stock" }
  | { kind: "partial"; readyLines: number; totalLines: number; earliestEta: string | null }
  | { kind: "awaiting"; earliestEta: string }   // all short, ETA known
  | { kind: "no-eta" }                            // all short, no ETA
  | { kind: "bom-needed" };                       // overrides others

export type ProductionState = "not-started" | "in-progress" | "done" | "cancelled";
export type DeliveryState = "not-shipped" | "partially-shipped" | "shipped" | "n-a";

export type OrderPipelineRollup = {
  orderId: string;
  components: ComponentsState;
  production: ProductionState;
  delivery: DeliveryState;
  targetShipDate: string | null;
  isOverdue: boolean;
};

export async function getOrdersPipelineRollup(
  supabase: SupabaseClient,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, OrderPipelineRollup>>;
```

Internally composes:

- `getOrderLineStatus` (existing) — extended to additionally fetch the earliest open-PO `expected_date` per short component.
- `getOrderProductionState(supabase, tenantId, orderIds)` (new) — returns `Map<orderId, ProductionState>`. Reads `job_cost_snapshot` and `job_actual_time_entry`. Reads `orders.status` for the cancelled override.
- `getOrderDeliveryState(supabase, tenantId, orderIds)` (new) — returns `Map<orderId, DeliveryState>`. Reads `order_line.shipped_at` per order.
- `computeTargetShipOverdue(targetShipDate, deliveryState)` — pure helper.

Total batched Supabase queries for a 50-row page: ~6 (orders, order_line, product_bom, inventory_balance + purchase_order_line, job_cost_snapshot/labor_plan/actuals, order_source_sla).

### 5.1 Earliest-PO-ETA derivation

For each short component (`requiredQty > availableQty`), look up:

```sql
select component_id, min(po.expected_date) as earliest_eta
from public.purchase_order_line pol
join public.purchase_order po on po.id = pol.purchase_order_id
where pol.tenant_id = :tenantId
  and pol.component_id = any(:shortComponentIds)
  and po.status in ('draft', 'sent', 'partial')
  and po.expected_date is not null
group by component_id;
```

(`purchase_order_line` table is referenced in existing reports; verify column name during implementation.)

Aggregation to order level:
- **In stock** = no short components across any line.
- **Partial** = at least one line fully covered AND at least one line with a short component. `earliestEta` = min of ETAs across short components in the not-ready lines. May be null.
- **Awaiting** = no line fully covered AND at least one short component has an ETA. `earliestEta` = min of ETAs across all short components.
- **No ETA** = no line fully covered AND no short component has an ETA.
- **BOM needed** = at least one line where the variant has no active BOM or the BOM has zero components. Supersedes all other Components states.
- **Empty** = order has zero lines.

## 6. Production state derivation

| Condition | Result |
| --- | --- |
| `orders.status = 'cancelled'` | `cancelled` (supersedes) |
| No `job_cost_snapshot` rows for any line of the order | `not-started` |
| Snapshots exist; zero `job_actual_time_entry` rows | `not-started` |
| Snapshots exist; ≥1 actual time entry; not all snapshots have `snapshot_status = 'completed'` | `in-progress` |
| All `job_cost_snapshot.snapshot_status` for the order = `'completed'` | `done` |

## 7. Delivery state derivation

| Condition | Result |
| --- | --- |
| Order has zero lines | `n-a` |
| No line has `shipped_at` set | `not-shipped` |
| All lines have `shipped_at` set | `shipped` |
| Some but not all lines have `shipped_at` set | `partially-shipped` |

### 7.1 How `shipped_at` is written

- **Shopify sync** (`src/lib/shopify/sync.ts`): when a fulfillment payload arrives, set `shipped_at = now()` on each matched line. `fulfillment_status = 'fulfilled'` → all order lines; `fulfillment_status = 'partial'` → only the matched lines.
- **Manual button** on the Delivery tab of the detail page → server action `markLineShipped(orderLineId)`.

## 8. Target ship date

- Computed on order insert: `target_ship_date = created_at + sla.lead_time_days` where `sla` row matches `(tenant_id, source)`.
- Editable per order on the detail page.
- Highlighting in the list column:
  - `target_ship_date < now()` AND delivery ≠ `shipped` → red text + "Nd late" suffix.
  - Within 2 days of now → amber text (nice-to-have; can ship in v1).
  - Otherwise → normal text.

## 9. List page UI (`/app/orders`)

### 9.1 Columns

| Column | Source / behavior |
| --- | --- |
| Order | `#{order_number ?? id.slice(0,8)} · N lines` (inline lines count) |
| Customer | `customer_email · (source chip)` — "Shopify" / "B2B" derived from `source` |
| Target ship | Formatted date; red with "Nd late" suffix when overdue |
| Total | Sum of `order_line.line_sell_price` |
| Components | Pill from `ComponentsState` |
| Production | Pill from `ProductionState` |
| Delivery | Pill from `DeliveryState` |

No drag handle in v1. Default sort: `target_ship_date asc nulls last, created_at desc`.

### 9.2 Tabs

Workflow-driven filtering of the same dataset:

| Tab | Predicate |
| --- | --- |
| Open | Not `done` in production AND not `shipped` in delivery |
| In production | Production = `in-progress` |
| Ready to ship | Production = `done` AND Delivery ≠ `shipped` |
| Done | Delivery = `shipped` OR `orders.status = 'fulfilled'` |
| All | Everything (excluding `orders.status = 'cancelled'` by default; toggle to include) |

Tab counts shown as badges.

## 10. Detail page (`/app/orders/[orderId]`)

### 10.1 Persistent header

Top panel (always visible):
- Row 1: Order #, customer + source, target ship (with on-track / late chip), total, lines count.
- Row 2 (below divider): the three pipeline pills — Components / Production / Delivery — same as the list.

### 10.2 Tabs

Driven by `?tab=` URL param. Default `sales-items`. Tabs persist on reload and are linkable.

#### Sales items tab (default)

Per-line table:

| Column | Notes |
| --- | --- |
| Item | Variant title + SKU + BOM version |
| Qty | `order_line.quantity` |
| Unit price | `order_line.unit_sell_price` |
| Total | `order_line.line_sell_price` |
| Components | Per-line readiness pill + breakdown of short components (component name, need/have, source PO + expected_date) |
| Action | "Re-allocate" button (existing `allocateOrder` action) |

#### Production tab

Surfaces existing `job_labor_plan` + `job_actual_time_entry` data, grouped by line:

| Line | Department | Operation | Planned hrs | Actual hrs | Status |

No new data sources. Same rollup that drives the order-level Production pill.

#### Delivery tab

Per-line shipping status:

| Line | Qty | Status | Shipped at | Action |

"Mark shipped" sets `order_line.shipped_at = now()`. Shows informational note: "For Shopify orders, status auto-flips on next sync when fulfillment lands." The button is still available for manual override.

## 11. Settings (`/app/settings/orders` — new)

Small settings panel to edit the two `order_source_sla` rows:

- Shopify order lead time: `[__] days` (default 7)
- Manual order lead time: `[__] days` (default 10)

Saving updates `order_source_sla` for the tenant. Existing `target_ship_date` values are NOT recomputed; new orders pick up the new SLA on insert.

## 12. Edge cases

1. **Mixed-BOM order** — `BOM needed` (red) supersedes other Components states.
2. **Empty BOM** — treated as `BOM needed`, not `In stock`.
3. **PO with null `expected_date`** — that component contributes no ETA to the rollup; falls back to `No ETA` if it is the only ETA source.
4. **Multiple POs for same component** — earliest `expected_date` among open POs (`status in ('draft','sent','partial')`).
5. **PO ETA in the past** — kept in the rollup. Showing late ETAs is informative.
6. **Cancelled order** — `cancelled` pill in Production supersedes; Delivery shows `—`; Components still computed (so user can see what was short).
7. **Shopify partial fulfillment** — sets `shipped_at` only on matched lines → `partially-shipped`.
8. **Manual order without target_ship_date** — column shows `—`; never flagged overdue.
9. **Tenant created before SLA seed** — patch backfills `(tenant_id, 'shopify', 7)` and `(tenant_id, 'manual', 10)` for every existing tenant.
10. **Variant referenced by an order but later soft-deleted** — order line keeps its `variant_id`; readiness still computes against last-known BOM if active.

## 13. Files touched

```
+ src/lib/orders/pipeline-rollup.ts
+ src/lib/orders/pipeline-rollup.test.ts
+ src/lib/orders/production-state.ts
+ src/lib/orders/delivery-state.ts
+ src/lib/orders/target-ship.ts
+ src/app/app/orders/_tabs/sales-items-tab.tsx
+ src/app/app/orders/_tabs/production-tab.tsx
+ src/app/app/orders/_tabs/delivery-tab.tsx
+ src/app/app/orders/_components/pipeline-pills.tsx
+ src/app/app/orders/[orderId]/mark-shipped-action.ts
+ src/app/app/settings/orders/page.tsx
+ src/app/app/settings/orders/sla-form.tsx
+ supabase/patches/orders_source_and_target_ship.sql
+ supabase/patches/order_source_sla_table.sql
+ supabase/patches/order_line_shipped_at.sql
~ src/app/app/orders/page.tsx                  // consume rollup, new columns + tabs
~ src/app/app/orders/[orderId]/page.tsx        // tabbed layout
~ src/app/app/orders/orders.module.css         // new pill/tab styles using Manuva tokens
~ src/lib/shopify/sync.ts                      // set source='shopify'; set shipped_at on fulfillment
~ src/lib/orders/order-line-status.ts          // earliest-PO-ETA logic for short components
```

## 14. Testing

- `src/lib/orders/pipeline-rollup.test.ts` — TDD. One test per Components state and per Production/Delivery state. Cover the edge cases in §12 (mixed BOM, null ETA, multiple POs, partial Shopify fulfillment, cancelled order).
- `src/lib/orders/order-line-status.test.ts` — extend existing tests with short-component ETA derivation cases.
- Smoke fixture: one tenant + 5 orders covering each Components state. Used by both the rollup test and a page-level render test.
- Existing failing tests in `allocation/engine.test.ts` and `inventory/invariants.test.ts` stay deferred per memory note.

## 15. Out of scope (explicit deferrals)

- Customer table and per-customer SLA.
- Drag-rank for manual production priority.
- Production progress percentage on the pill.
- Per-line `packed_at` state and the `Packed` / `Partially packed` pills.
- Quotes tab.
- Mobile-specific layout (the existing layout is desktop-first).

## 16. Design system

All pills, tabs, and table styles use Manuva design tokens from `colors_and_type.css`. Pill colors map to existing semantic tokens (success / warning / danger / info / neutral). No new tokens introduced.
