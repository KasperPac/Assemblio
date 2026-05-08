# Reports Redesign — Design Spec

**Date:** 2026-05-08
**Author:** Kasper Simonsen (with Claude)
**Status:** Approved — ready for implementation plan

---

## 1. Purpose

Replace the current single-page reports stub (4 stat cards + integrity cards + CSV export) with a hub-and-spoke reports section covering inventory, purchasing, and system integrity. The redesign gives every report its own focused page with date filtering, per-section summary stats, and both PDF and CSV export.

---

## 2. Context

- **Current state:** One page at `/app/reports` with 4 financial stat cards, 4 inventory integrity cards, a thin "reporting model" summary, and a single CSV export endpoint. No date filtering, no charts, no per-category drill-down.
- **Competitive gap:** Katana and Cin7 both have per-category report pages with date ranges and CSV export. Neither surfaces **lead time accuracy** (promised vs actual delivery), **dead stock with capital value**, or **BOM health** as first-class reports — these are genuine market gaps.
- **Phase scope:** Phase 1 (this plan) covers 10 operational reports using existing DB data — no schema changes required. Phase 2 (separate plan, after financial profitability ships) adds Production × 3 and Finance × 4 reports that depend on `order_line.unit_sell_price` being populated.

---

## 3. Architecture

### 3.1 Route structure

| Route | Page |
|---|---|
| `/app/reports` | Hub — live-data cards |
| `/app/reports/stock-on-hand` | Stock on hand |
| `/app/reports/movements` | Movements ledger |
| `/app/reports/valuation` | Inventory valuation |
| `/app/reports/dead-stock` | Dead stock |
| `/app/reports/stocktake-history` | Stocktake history |
| `/app/reports/po-summary` | PO summary |
| `/app/reports/spend-by-supplier` | Spend by supplier |
| `/app/reports/lead-time-accuracy` | Lead time accuracy |
| `/app/reports/po-variance` | PO quantity variance |
| `/app/reports/inventory-integrity` | Inventory integrity (migrated) |

Date range is passed as `?from=&to=` query params. Server components read them directly — URLs are bookmarkable and shareable.

### 3.2 Shared components

| Component | Responsibility |
|---|---|
| `ReportShell` | `PageHeader` + date preset picker + PDF/CSV export buttons. Wraps every report page. |
| `ReportStatCards` | Row of 2–3 summary stat cards above the table. |
| `ReportTable` | Sortable table with status badges. Used by all reports. |
| `ReportChart` | Thin wrapper around Recharts (React 19 compatible, SSR-safe). Imported only by the 5 chart-enabled reports. |

### 3.3 Date presets

Operational presets on every report page: **Today · This week · Last 30 days · Last 90 days · This year · Custom**. Default is Last 30 days. Custom shows a from/to date input.

### 3.4 Export

**CSV:** Each report has a `/app/reports/[slug]/export` API route that runs the same server query and returns a CSV download. Follows the existing `reports/export/route.ts` pattern.

**PDF:** Browser `window.print()` with a `@media print` CSS block — hides shell chrome, expands the table, renders a header with report name + date range. A "Print / Save as PDF" button triggers it. Zero server-side dependencies.

### 3.5 Chart library

**Recharts** — lightweight, React 19 compatible, SSR-safe. Used only on the 5 time-series reports listed in section 4.

---

## 4. Hub page — `/app/reports`

The hub loads one lightweight aggregate query per report card. Cards are grouped by category with colour-coded section labels. Cards with issues are highlighted:

- **Amber** (`#fffbeb` background, `#fcd34d` border) — needs attention (e.g. dead stock present, PO variance found)
- **Red** (`#fff5f5` background, `#fca5a5` border) — action required (e.g. lead time accuracy below threshold, integrity issues open)
- **Default** — white card, standard border

Each card shows: report name, one headline metric (count, value, or percentage), a one-line supporting description, and a "View report →" link. The card is fully clickable.

**Category groups (Phase 1):**

| Category | Reports |
|---|---|
| 📦 Inventory | Stock on hand, Movements ledger, Inventory valuation, Dead stock, Stocktake history |
| 🛒 Purchasing | PO summary, Spend by supplier, Lead time accuracy, PO quantity variance |
| 🔧 System | Inventory integrity |

---

## 5. Individual report pages

### 5.1 Adaptive layout rule

Each report is one of two templates:

- **Stats + table** — `ReportShell` → `ReportStatCards` (2–3 cards) → `ReportTable`. For point-in-time or aggregate reports where a trend chart adds no value.
- **Chart + table** — `ReportShell` → `ReportStatCards` → `ReportChart` → `ReportTable`. For time-series reports where the chart reveals patterns the table cannot.

| Template | Reports |
|---|---|
| Chart + table | Movements ledger, Inventory valuation, Spend by supplier, Lead time accuracy, Stocktake history |
| Stats + table | Stock on hand, Dead stock, PO summary, PO quantity variance, Inventory integrity |

### 5.2 Per-report specification

**Stock on hand**
Stats: total components, total on-hand value, count below reorder point (amber if > 0).
Table columns: Component, SKU, Location, On hand, Reserved, In production, Value, Status badge (OK / Low / Out).
Filters: Location.
No chart.

**Movements ledger**
Stats: total movements, stock in (sum), stock out (sum).
Chart: daily bar chart — stock in (green) and stock out (red) bars per day over the selected period.
Table columns: Date, Component, Type badge (receipt / allocation / adjustment / stocktake), Reference, Qty (signed, coloured green/red).
Filters: Movement type, Component (search).

**Inventory valuation**
Stats: total on-hand value, in-production value, total reserved value.
Chart: line chart of total on-hand value over time (requires daily snapshots or derived from movements; fall back to current-only if history not available).
Table columns: Component, SKU, On hand qty, Cost per unit, Total value, % of total.
Filters: Location.

**Dead stock ★**
Stats: dead component count (amber), capital tied up (amber), longest idle (days).
Table columns: Component, SKU, On hand qty, Value, Days since last movement.
Sort default: days idle descending.
Filters: Idle threshold (30d / 60d / 90d / 180d — default 90d).
No chart.

**Stocktake history**
Stats: total stocktakes completed, total variance lines, largest single variance.
Chart: bar chart — variance count per stocktake over time.
Table columns: Date, Location, Status, Lines counted, Variance lines, Total variance qty.
Clicking a row expands to show per-component variance detail.

**PO summary**
Stats: open liability ($), POs outstanding (count), overdue POs (count — red if > 0).
Table columns: PO number, Supplier, Status badge, Expected date, Total value, Lines.
Filters: Status, Supplier.
No chart.

**Spend by supplier**
Stats: total spend (period), supplier count, largest single supplier spend.
Chart: horizontal bar chart — spend per supplier, sorted descending.
Table columns: Supplier, POs in period, Total spend, % of total spend, Avg lead time.
Filters: none beyond date range.

**Lead time accuracy ★**
Stats: overall on-time %, suppliers with < 80% accuracy (red if > 0), total POs in period.
Chart: line chart — on-time % per supplier over rolling periods.
Table columns: Supplier, POs received, On time, Late, Accuracy %, Avg days late.
Note: requires `purchase_order` to have both a promised date (`expected_date`) and an actual receipt timestamp. Column name to confirm during implementation — may be `received_date`, `updated_at`, or derived from `purchase_order_line.received_at`.

**PO quantity variance**
Stats: variance lines count (amber if > 0), total over-received qty, total under-received qty.
Table columns: PO number, Supplier, Component, Ordered qty, Received qty, Variance, Variance %.
Filters: Variance direction (over / under / all).
No chart.

**Inventory integrity** (migrated from current `/app/reports`)
Stats: total issues (red if > 0), invariant issues, reconciliation drifts, duplicate allocations, PO over-receipts.
Table: existing issue detail rows, restyled using `ReportTable`.
No date range picker (integrity is always current state).
No chart.

---

## 6. Out of scope (Phase 1)

- Production reports (job cost summary, material usage, BOM health) — Phase 2
- Finance reports (revenue, gross margin, COGS, profitability by variant) — Phase 2, gated on Shopify sell price sync
- Per-user saved filters or report subscriptions
- Scheduled email delivery of reports
- Custom column selection
- Inline drill-down charts within hub cards
- Real-time WebSocket updates (server-rendered on page load is sufficient for v1)
