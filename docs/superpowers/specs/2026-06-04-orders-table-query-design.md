# Orders table: filter, sort, paginate (server-side) — design

**Date:** 2026-06-04
**Status:** Draft for review

## Problem

`src/app/app/orders/page.tsx` fetches up to 200 orders, computes pipeline rollups
in memory, and filters by tabs whose state is *derived* (not stored). With full
order history now syncing, that approach doesn't scale and offers no sorting,
no real filtering, and no pagination. The table needs to be filterable, sortable,
and paginated against the real dataset.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Strategy | **Server-side** filter/sort/paginate on DB columns |
| Filters | Search (order # / customer), Status, Source, Date range (order date), Historical (all / only / hide) |
| Sortable columns | Order date, Order #, Customer, Status, Target ship date, **Total** (summed) |
| Pagination | Prev/Next, **25** per page, with "X–Y of N" |
| Pipeline state | Display-only pills for the current page's rows; the old derived tabs are removed |

## Architecture

URL-driven server-side table. The page reads filter/sort/page from `searchParams`,
calls one Postgres RPC (`list_orders`) that filters, sorts (including by summed
order total), and paginates in SQL and returns the page rows plus a total count.
Pipeline pills are computed only for the returned page (≤25 rows) via the existing
`getOrdersPipelineRollup` (a small `.in()` — safe). State lives entirely in the URL,
so the table is shareable/back-button friendly and the server component re-queries
on each change.

### Why an RPC

`Total` is a `sum(order_line.line_sell_price)` per order — the only aggregate.
Sorting/paginating by it can't be done with the PostgREST query builder cleanly.
A single RPC keeps one consistent code path for all sorts/filters/pagination
instead of mixing PostgREST with a special case, and returns the page count in the
same round trip.

## DB — `list_orders` RPC (new migration)

`supabase/patches/list_orders_rpc.sql`. `SECURITY INVOKER` (existing RLS on
`orders`/`order_line` applies; `p_tenant_id` is belt-and-suspenders).

Signature:
```
list_orders(
  p_tenant_id   uuid,
  p_search      text,     -- null/empty = no search
  p_status      text,     -- null = any
  p_source      text,     -- null = any
  p_historical  text,     -- 'all' | 'only' | 'hide'  (default 'all')
  p_date_from   date,     -- null = open start
  p_date_to     date,     -- null = open end
  p_sort        text,     -- whitelisted; default 'order_date'
  p_dir         text,     -- 'asc' | 'desc'; default 'desc'
  p_limit       int,      -- default 25
  p_offset      int       -- default 0
)
returns table (
  id uuid, order_number text, customer_email text, status text, source text,
  target_ship_date timestamptz, shopify_processed_at timestamptz,
  shopify_created_at timestamptz, fulfilled_at timestamptz, historical boolean,
  order_total numeric, total_count bigint
)
```

Behavior:
- CTE: `orders o` LEFT JOIN `(select order_id, sum(line_sell_price) total from order_line where tenant_id = p_tenant_id group by order_id) ol on ol.order_id = o.id`.
- `order_date := coalesce(o.shopify_processed_at, o.shopify_created_at)`.
- WHERE `o.tenant_id = p_tenant_id`
  AND (`p_search` empty OR `o.order_number ILIKE '%'||p_search||'%'` OR `o.customer_email ILIKE '%'||p_search||'%'`)
  AND (`p_status` null OR `o.status = p_status`)
  AND (`p_source` null OR `o.source = p_source`)
  AND (`p_historical` = 'all' OR (`p_historical='only'` AND o.historical) OR (`p_historical='hide'` AND NOT o.historical))
  AND (`p_date_from` null OR order_date >= p_date_from)
  AND (`p_date_to` null OR order_date < (p_date_to + 1)).
- `total_count` = `count(*) over()`.
- ORDER BY a whitelist mapped from `p_sort`: `order_date` → order_date; `order_number`; `customer_email`; `status`; `target_ship_date`; `total` → coalesce(ol.total,0). Direction from `p_dir`. Stable tiebreaker `o.id`. Unknown `p_sort` falls back to `order_date desc`.
- LIMIT `p_limit` OFFSET `p_offset`.

## Page + components

- `orders/page.tsx` (server): parse `searchParams` via a tested helper
  (`parseOrdersQuery`) that whitelists sort, validates dir, clamps page/size and
  computes offset, and normalizes filters. Call the RPC. Compute pills for the
  returned rows. Render filter bar, sortable headers, rows, pagination. Replaces
  the 200-row fetch + tab logic.
- `orders/_components/orders-filters.tsx` (client): search input (debounced ~300ms),
  status select, source select, date-from/date-to inputs, historical select. Each
  writes to URL `searchParams` (via `useRouter`/`usePathname`), resetting `page` to 1.
- `orders/_components/sortable-header.tsx` (client or links): each sortable `<th>`
  is a link that sets `sort`+`dir` in the URL (toggles dir if already active) and
  shows an active ▲/▼ indicator.
- `orders/_components/orders-pagination.tsx` (client): Prev/Next links (disabled at
  bounds) + "X–Y of N" from `total_count`.

## Helper (pure, tested)

`src/lib/orders/orders-query.ts` — `parseOrdersQuery(searchParams)` →
`{ search, status, source, historical, dateFrom, dateTo, sort, dir, page, pageSize, limit, offset }`.
Whitelists `sort` to the allowed set (default `order_date`), `dir` to asc/desc
(default desc), `historical` to all/only/hide (default all), clamps `page >= 1`,
fixed `pageSize = 25`, `offset = (page-1)*pageSize`. Unit tested.

## Testing

- Unit: `parseOrdersQuery` — whitelisting, defaults, clamping, offset math, bad input.
- RPC: verified with sample params via read-only SQL against prod (filters, each
  sort incl. total, count, paging).
- Page/components: tsc + lint + manual (no existing tests for these route components).

## Out of scope / follow-ups

- Sorting/filtering by *derived* pipeline state (components/production/delivery) —
  not stored; pills remain display-only.
- `read_all_orders` scope for >60-day history (separate, needs Shopify approval).
- Saved views / column visibility / CSV export of the filtered set.
