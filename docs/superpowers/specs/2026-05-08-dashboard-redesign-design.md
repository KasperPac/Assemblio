# Dashboard Redesign — Design Spec

**Date:** 2026-05-08
**Author:** Kasper Simonsen (with Claude)
**Status:** Approved — ready for implementation plan

---

## 1. Purpose

Replace the current placeholder dashboard with a meaningful operations intelligence view, backed by a per-tenant widget configuration system. The dashboard should answer the question "are we in good shape right now?" in 30 seconds for two distinct personas:

- **Business owner** — checks once a day, wants revenue, margin, and inventory health
- **Operations manager** — checks multiple times a day, wants queue urgency, stock risk, and purchasing signals

Both personas are served by the same dashboard via a per-tenant preset system configured by an admin.

---

## 2. Context

- **Product:** Manuva (formerly Assemblio) — Shopify-native MRP, AU/NZ market, pre-launch SaaS
- **Current dashboard:** Three hardcoded sections (Orders & Stock, Finance, Planning). Real data but low signal-to-noise. No revenue or margin (blocked by Shopify sell price sync bug). No purchasing signals. Not configurable.
- **Competitive gap:** Katana's Insights dashboard is paywalled. Cin7 has deep analytics but ERP-level complexity. Neither tool provides a clean "morning view" that combines what needs shipping with what's blocking it — this is the gap Manuva fills.
- **Dependency:** Four finance widgets (revenue trend, gross margin %, average order value, GMROI) require the Shopify sell price fix from the financial profitability plan (`docs/superpowers/plans/2026-05-04-financial-profitability.md`). These widgets are built and shown in the catalog but render in an "unavailable" state until the fix ships.

---

## 3. Architecture

### 3.1 Widget catalog

17 widgets across four categories. Each widget is an independent server-fetched data unit rendered as a React server component or a client component where interactivity is needed.

**Operations (5 widgets)**

| Widget | Description | Status |
|---|---|---|
| Open orders queue | Count + mini-list of unfulfilled orders with status badges | Exists (refactor) |
| On-time fulfillment rate | % orders fulfilled on time, rolling 30 days | Exists (refactor) |
| Production throughput | Orders completed this week vs. last week with trend arrow | New |
| Purchasing signals | Overdue POs + components at or near reorder point in one list | New |
| Order trend chart | 6-month placed vs. fulfilled line chart | Exists (refactor) |

**Inventory (5 widgets)**

| Widget | Description | Status |
|---|---|---|
| Inventory value snapshot | On-hand, in-production, reserved — cost value breakdown | Exists (refactor) |
| Low stock alerts | Components at or below reorder point with days-remaining bars | Exists (enhanced) |
| Inventory turnover ratio | COGS ÷ avg inventory value, rolling 90 days | New |
| Days of inventory remaining | Top 5 components: days until stockout at current burn rate | New |
| Top products demand | Donut chart — top 5 products by order volume this month | Exists (refactor) |

**Finance (4 widgets — gated on Shopify price sync)**

| Widget | Description | Status |
|---|---|---|
| Revenue trend | Monthly revenue for last 6 months from Shopify order prices | New (gated) |
| Gross margin % | Sell price minus COGS, averaged across orders this month | New (gated) |
| Average order value | Mean sell value per order, this month vs. last month | New (gated) |
| GMROI | Gross margin return on inventory — margin per $1 of inventory held | New (gated) |

**Planning (3 widgets)**

| Widget | Description | Status |
|---|---|---|
| BOM health | Coverage %, missing BOMs count, integrity issues | Exists (refactor) |
| Sell-through rate | % of received inventory sold in the period | New (gated) |
| Quick actions | Jump-to shortcuts: Build BOMs, stocktake, components, settings | Exists (refactor) |

**Gated widgets** render with an "unavailable — fix Shopify price sync" state and a CTA linking to Settings → Shopify. They are always shown in the Settings widget catalog so admins know they exist and can plan to enable them.

### 3.2 Presets

Three starting configurations stored as JSON arrays of widget IDs in order. Switching preset resets the active widget list to the preset's defaults; the admin can then add or remove individual widgets.

**Owner preset (default for new tenants)**
```
revenue-trend, gross-margin, avg-order-value, gmroi,
inventory-value-snapshot, inventory-turnover,
open-orders-queue, top-products-demand
```

**Operations preset**
```
open-orders-queue, production-throughput, on-time-fulfillment,
purchasing-signals, low-stock-alerts, days-inventory-remaining,
bom-health, order-trend-chart
```

**Custom preset** — blank slate, admin picks from full catalog.

New tenants receive the Owner preset by default. They are prompted once in Settings to "customise your dashboard" on first visit.

### 3.3 Dashboard layout

Widgets render in a **2-column CSS grid** (`grid-template-columns: 1fr 1fr`). Widget size is defined per widget as a fixed span:

- **Stat card** (single metric + trend): each widget definition declares a `size` of `"stat"`, `"half"`, or `"full"`. The dashboard grid detects consecutive `"stat"` widgets and renders them in a 3-column subrow (`grid-template-columns: 1fr 1fr 1fr`). Presets are designed so stat-type widgets always appear in groups of 3; if a preset has 1 or 2 stat widgets, they fall back to half-width cards.
- **List/chart card** (queue, signals, charts): half-width by default, full-width for trend chart.
- **Full-width override**: order trend chart and revenue trend always span full width (`grid-column: 1 / -1`).

The order of widgets in the grid matches the order in the tenant's active widget list. No drag-to-reorder in the dashboard itself — reordering happens in Settings by dragging widget rows (v2 scope).

### 3.4 Configuration UI

**Route:** `/app/settings` — new "Dashboard" tab alongside existing General/Shopify/Users tabs.

**Layout:**
1. **Preset selector** — three cards (Owner, Operations, Custom). Selecting a preset rewrites the active widget list to that preset's defaults and re-renders the toggle list below.
2. **Widget toggle list** — all 15 widgets grouped by category (Operations, Inventory, Finance, Planning). Each row has a name, description, on/off toggle, and optional status tag ("Needs price sync" for gated widgets). Gated widgets are always visible but their toggle is disabled with the tag.
3. **Save button** — persists to `tenant_dashboard_config`. Applies immediately to all users in the workspace.

### 3.5 Data model

New table: `tenant_dashboard_config`

```sql
create table tenant_dashboard_config (
  tenant_id  uuid primary key references tenant(id) on delete cascade,
  preset     text not null default 'owner',        -- 'owner' | 'ops' | 'custom'
  widgets    text[] not null default '{}',          -- ordered list of widget IDs
  updated_at timestamptz not null default now()
);
```

RLS: tenant members can read; only `admin` and `super_admin` roles can write.

The dashboard page reads this config server-side and conditionally renders only the active widgets. No client-side feature flags.

**Fallback for unconfigured tenants:** If no `tenant_dashboard_config` row exists for a tenant (e.g. existing tenants before migration, new tenants before first save), the dashboard falls back to the Owner preset's default widget list in code. The row is written on first save in Settings.

---

## 4. New widget data requirements

### Production throughput
Query `orders` where `status = 'fulfilled'` and `updated_at` within current ISO week vs. prior ISO week. Computed server-side, no new DB columns.

### Purchasing signals
Union of:
- `purchase_order` rows where `expected_date < now()` and order is not yet received (overdue POs)
- `inventory_balance` joined with `component.reorder_point` where `on_hand - reserved <= reorder_point` (components at or below reorder point)

Ordered by urgency: overdue POs first, then components by days remaining ascending. Actual `purchase_order` status column names to be confirmed against schema during implementation.

### Days of inventory remaining
For each component: `(on_hand - reserved) / avg_daily_burn` where `avg_daily_burn` is the mean daily consumption from `bom_component` usage across fulfilled orders in the last 30 days. Requires a new computed query, no schema changes.

### Inventory turnover ratio
`COGS_90d / avg_inventory_value_90d`. COGS is summed from `job_cost_snapshot.material_cost` for fulfilled orders in the window. Average inventory value uses start/end snapshots from `inventory_balance`.

### Finance widgets (gated)
All four read from `order_line.unit_sell_price` and `order_line.line_sell_price`. These are currently always `0` — the financial profitability plan fixes this. No new queries needed beyond what that plan already specifies.

---

## 5. Phasing

**Phase 1 — This plan (dashboard redesign):**
- `tenant_dashboard_config` table + RLS
- Settings → Dashboard tab (preset selector + widget toggles)
- Refactor existing widgets to the new grid layout
- Build new non-gated widgets: production throughput, purchasing signals, days of inventory remaining, inventory turnover ratio
- Gated finance widgets render as "unavailable" placeholders

**Phase 2 — After financial profitability plan ships:**
- Finance widgets automatically unlock once `unit_sell_price` is populated
- No dashboard code changes required — the gated state is data-driven

---

## 6. Out of scope

- Per-user dashboard configuration (only per-tenant in v1)
- Drag-to-reorder widgets on the dashboard canvas
- Custom date range selectors per widget
- Embedded drill-down charts within widgets (widgets link out to detail pages)
- Real-time WebSocket updates (server-rendered on page load is sufficient for v1)
