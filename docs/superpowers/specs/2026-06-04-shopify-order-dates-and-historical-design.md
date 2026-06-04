# Shopify order dates + historical (stats-only) orders — design

**Date:** 2026-06-04
**Status:** Draft for review

## Problem

Synced Shopify orders carry no real Shopify timestamps — only `orders.created_at`
(the import time) and `orders.updated_at` (the row-update time). As a result:

1. The dashboard "Order metrics" chart (`src/app/app/_dashboard/orders-chart.tsx`)
   buckets orders by `created_at` and computes lead time as `updated_at − created_at`.
   After the initial bulk import of 250 orders, every order lands in the import
   month with ~zero lead time — the stats are meaningless.
2. There is no order-placed date, real shipped date, or modification date to report on.
3. The sync caps at 250 orders, so older history never arrives.
4. Worse: syncing historical orders runs allocation/planning against them.
   `reconcileOrderAllocations` reserves BOM components for **open** orders
   (writes `inventory_movement` + bumps `inventory_balance.reserved`), so importing
   old open orders silently steals stock from current production, and
   `generate_job_financial_plan` pollutes current capacity/planning.

## Goals

- Capture real Shopify dates: order placed, processed, modified, and shipped.
- Make order stats key off the real order date.
- Import full order history (lift the 250 cap) for retrospective revenue stats.
- Import pre-go-live orders as **stats-only**: they count toward revenue/date
  charts but never move stock or generate plans. Self-heal the reservations the
  first sync already created for them.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Order date | Store **both** `processedAt` and `createdAt`; use `processedAt` (fallback `createdAt`) for stats |
| Shipped date | **Both** — order-level `fulfilled_at` and real per-line `order_line.shipped_at` |
| 250 cap | Raise it — paginate full order history |
| Historical cutoff | **Per-store** `shopify_store.stats_only_before`, editable in integrations settings |
| Historical visibility | **Visible** in the orders list with a "Historical" badge; excluded from allocation/planning/operational views |

## Schema changes

`orders` — new columns (all nullable except `historical`):
- `shopify_created_at timestamptz` — Shopify `createdAt`
- `shopify_processed_at timestamptz` — Shopify `processedAt`
- `shopify_updated_at timestamptz` — Shopify `updatedAt` (modification date)
- `fulfilled_at timestamptz` — order-level shipped date (earliest fulfillment `createdAt`)
- `historical boolean not null default false`

`shopify_store` — new column:
- `stats_only_before date` (nullable) — orders whose order date is before this are
  flagged historical. Null = nothing is historical (default).

`order_line.shipped_at` already exists — populated with the real fulfillment date
instead of the current `now()`.

(Existing `orders.created_at`, `orders.updated_at`, and `orders.target_ship_date`
are left untouched; the new `shopify_*` columns sit alongside them.)

## Sync changes (`src/lib/shopify/sync.ts`)

**Query (`fetchOrders`):**
- Remove the `>= 250` break — paginate all orders (keep `sortKey: UPDATED_AT`).
- Add to each order: `createdAt`, `processedAt`, `updatedAt`.
- Add `id` to `lineItems` nodes (needed to map fulfillments → variants).
- Add `fulfillments(first: 10) { createdAt fulfillmentLineItems(first: 100) { lineItem { id } } }`.

**Per order:**
- `orderDate = processedAt ?? createdAt`.
- Load `shopify_store.stats_only_before`; `historical = cutoff != null && orderDate < cutoff`.
- Order upsert writes `shopify_created_at`, `shopify_processed_at`, `shopify_updated_at`,
  `fulfilled_at` (earliest fulfillment `createdAt`, or null), and `historical`.

**Shipped dates (per line):**
- Build `lineItemId → variantId` from the order's line items.
- Build `variantId → earliest fulfillment createdAt` via `fulfillmentLineItems → lineItem.id → variant`.
- Set each `order_line.shipped_at` from that map (null if the line's variant was never
  fulfilled). Removes the `now()` hack and the FULFILLED-only blanket update.

**Allocation / planning (the stock-safety rule):**
- Partition synced orders into `liveOrderIds` (not historical) and `historicalOrderIds`.
- Run `reconcileOrderAllocations` and `generate_job_financial_plan` **only** for
  `liveOrderIds`.
- For `historicalOrderIds`, run a **release-only** allocation pass that deletes any
  existing `order_component_allocation` rows and reverses their `reserved`
  (extract the existing per-line clear logic from `reconcile-order.ts` into a
  `releaseOrderAllocations(client, tenantId, orderId)` helper). This is idempotent
  (no allocations → no-op) and self-heals the reservations the first 250-order sync
  created for orders that are now historical.

## Stats / consumer changes

- `src/app/app/_dashboard/orders-chart.tsx`: bucket by `shopify_processed_at`
  (fallback `shopify_created_at`); lead time = `fulfilled_at − orderDate`; revenue
  per order computed from `order_line` for the in-range order ids (chunked via the
  existing `chunk()` helper to avoid `.in()` URL limits). Historical orders are
  included (they are real revenue).
- Orders list (`src/app/app/orders/page.tsx`): show a "Historical" badge for
  `historical = true`; surface the order date. Confirm operational filters behave.
- Audit and exclude historical orders from operational/stock views:
  `src/lib/orders/pipeline-rollup.ts`, `src/app/app/planning/(gated)/floor/*`,
  and any allocation/capacity consumer.

## Settings UI

Integrations page (`src/app/app/settings/integrations/`): per connected store, add a
"Historical cutoff" date field bound to `stats_only_before`, saved via a server
action (admin-only, tenant-scoped). On save, prompt the user to re-sync so the
`historical` flags and reservations recompute.

## Backfill

No data migration. After deploy + setting the cutoff, **re-run the sync**: the upsert
updates the existing rows with real dates and `historical` flags, and the release pass
frees any stock the first sync wrongly reserved for historical orders.

## Testing

- Unit: `releaseOrderAllocations` (release math / idempotency); historical
  classification (`orderDate < cutoff`), incl. null cutoff and `processedAt`-fallback.
- Reuse `chunk()` for the revenue fetch.
- Manual: set a cutoff, re-sync the Fab store, verify (a) revenue chart spans real
  months, (b) `inventory_balance.reserved` drops for released historical orders,
  (c) live orders still allocate/plan.

## Out of scope / follow-ups

- Incremental sync (using an `updatedAt` watermark) instead of full re-fetch — the
  full paginated sync is acceptable for current volumes but may need this later.
- Per-line partial-fulfillment shipped dates beyond the first fulfillment per variant.
