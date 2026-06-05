# Dashboard product/sales metrics — design

**Date:** 2026-06-04
**Status:** Draft for review

## Problem

The dashboard shows inventory value, fulfillment rate, weekly throughput, and open
orders, plus two charts and the open-orders / low-stock cards. It has no
product-level or sales/profit metrics. We want: most popular product, highest-profit
product, revenue + average order value, gross margin %, and units sold.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Metrics | Most popular product, highest-profit product, revenue + AOV, gross margin %, units sold |
| Cost basis | **Material only** — Σ(active BOM component qty × component.cost_per_unit) |
| Window | **Last 30 days**, by real order date `coalesce(shopify_processed_at, shopify_created_at)` |
| Historical orders | **Included** (real sales/revenue), consistent with the order-metrics chart |
| Units label | **"Units sold (30d)"** (historical included ⇒ sold, not necessarily produced here) |
| No-BOM products | **Tagged** "no BOM" in the profit list (not excluded), so the number is transparent |

## Data model (verified)

- `order_line` (order_id, variant_id, quantity, line_sell_price) → `product_variant` (product_id) → `product` (title).
- Per-variant material unit cost: `product_bom` (is_active=true) → `product_bom_component` (quantity) → `component` (cost_per_unit).
- Order date + historical live on `orders`.

## Architecture

One RPC aggregates per-product sales/cost for the window; the page derives the KPIs
and top-N lists from those rows plus one small order-count query. Aggregation is
server-side, so result size is bounded by product count (not order/line count).

### RPC `dashboard_product_sales(p_tenant_id uuid, p_from date, p_to date)`

`language sql stable security invoker set search_path = public`. Returns one row per
product with sales in `[p_from, p_to)` (by order date, historical included):

```
returns table (
  product_id uuid,
  title text,
  units numeric,           -- sum(order_line.quantity)
  revenue numeric,         -- sum(order_line.line_sell_price)
  material_cost numeric,   -- sum(order_line.quantity * variant_unit_cost)
  profit numeric,          -- revenue - material_cost
  has_bom boolean          -- any line's variant had an active BOM with components
)
```

Implementation:
- CTE `variant_cost`: per variant, `sum(pbc.quantity * c.cost_per_unit)` from
  `product_bom pb` (pb.tenant_id = p_tenant_id, pb.is_active) join
  `product_bom_component pbc` join `component c`, grouped by `pb.variant_id`.
- Join `order_line ol` → `orders o` (o.tenant_id = p_tenant_id, order date in window)
  → `product_variant v` → left join `variant_cost vc on vc.variant_id = v.id`.
- Group by `v.product_id`, `p.title`. `material_cost = sum(ol.quantity * coalesce(vc.unit_cost, 0))`.
  `has_bom = bool_or(vc.unit_cost is not null)`.
- No ORDER BY needed (page sorts), but a default `order by revenue desc` is harmless.

### Page derivation (`src/app/app/page.tsx`)

- Compute window: `from = today − 30 days`, `to = today + 1 day` (exclusive upper).
- Call the RPC. Also run a small count: orders in the window (historical included) for
  the AOV denominator: `select count(*) from orders where tenant_id and order_date in window`.
  (A second RPC param or a dedicated tiny query — implementation detail; a query is fine.)
- Derive via a tested pure helper `deriveDashboardSalesMetrics(rows, orderCount)`:
  - `totalRevenue = Σ revenue`, `totalMaterialCost = Σ material_cost`, `totalUnits = Σ units`.
  - `avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0`.
  - `grossMarginPct = totalRevenue > 0 ? (totalRevenue − totalMaterialCost) / totalRevenue * 100 : 0`.
  - `mostPopular = rows sorted by units desc` (top 3).
  - `highestProfit = rows sorted by profit desc` (top 3).

## UI (existing dashboard patterns)

- **KPI chips**: add **Revenue (30d)**, **Avg order value**, **Gross margin %**, **Units sold (30d)**
  to the chip row (same `kpiChip`/`kpiLabel`/`kpiValue`/`kpiSub` markup already in the page).
- **"Top products · last 30 days" card** (same `card`/`cardHeader`/`eyebrow`/`cardTitle`
  pattern as the open-orders card): two small ranked lists side by side —
  **Most popular** (top 3 by units; row = product name → `/app/products/{id}`, units) and
  **Highest profit** (top 3 by profit; row = name, profit; a muted "no BOM" tag when
  `has_bom` is false).
- Empty state when no sales in the window.

## Testing

- Unit: `deriveDashboardSalesMetrics` — totals, AOV (incl. divide-by-zero), margin %
  (incl. zero revenue), top-3 ordering by units and by profit, no-BOM tagging.
- RPC: verified against prod with read-only sample calls (a window with known orders;
  spot-check a product's units/revenue/profit and the has_bom flag).
- Page wiring: tsc + lint + manual.

## Out of scope / follow-ups

- Labor in cost (material-only for v1); full-cost / job-snapshot basis later.
- Configurable window / per-metric historical toggle.
- Top customers (customer data not captured — `customer_email` is null).
