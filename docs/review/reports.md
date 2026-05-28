# Reports — Pre-Launch Feature Review

**Date:** 2026-05-28  
**Branch:** `feat/super-admin-foundation`  
**Scope:** `/app/reports` hub + 10 individual report pages

---

## Overview

The Reports feature is a read-only analytics section with 10 reports organised under three categories: **Inventory** (5), **Purchasing** (4), and **System** (1). Each report exposes a date preset bar, stat cards, optional charts, a data table, and a CSV export. The hub (`/app/reports`) shows live summary cards that link out to individual report pages.

---

## Findings

### 🔴 Bugs / Broken Behaviour

| # | Location | Issue |
|---|----------|-------|
| 1 | `reports/page.tsx` | **Hub page has no title heading.** `.pageTitle` is defined in the CSS module but never rendered in JSX. The page opens with nothing but a description paragraph — no `<h1>`, no `PageHeader` component, no eyebrow. |
| 2 | `date-preset-bar.tsx` | **"Custom" button does nothing.** `applyPreset(-1)` returns early with no side-effects. Custom date inputs only appear when `isCustom` is already true (pre-existing from/to in the URL). There is no way for a user to activate custom mode by clicking the button — it is a silent no-op. |
| 3 | `stock-on-hand/page.tsx` | **Date preset bar shown but date params never used.** The page renders `<ReportShell … searchParams={sp}>` (which draws the date bar) but never passes `from`/`to` to the Supabase query. The filters are decorative. |
| 4 | `valuation/page.tsx` | Same issue as #3 — date range is accepted via `searchParams` but not applied to the query. |
| 5 | `po-summary/page.tsx` | **PO # is a raw UUID fragment** (`id.slice(0, 8).toUpperCase()`). If the `purchase_order` table has a human-readable PO number field it should be preferred; otherwise the column heading should be clarified as an internal reference. |
| 6 | `movements/page.tsx` | **"Reference" column duplicates "Type".** The table shows `reference_type` in the Reference column, which is the same enum value already rendered (with a badge) in the Type column. Every row says e.g. `receipt` twice. |

---

### 🟡 Accessibility Issues

| # | Location | Issue |
|---|----------|-------|
| A1 | `report-table.tsx` | `<th>` elements have no `scope="col"` attribute — assistive technologies cannot reliably associate headers with cells. |
| A2 | `date-preset-bar.tsx` | The two custom date `<input type="date">` elements have no associated `<label>` — they are completely invisible to screen readers. |
| A3 | `report-chart.tsx` | Charts (recharts `BarChart` / `LineChart`) have no ARIA role, label, or description. A screen reader user gets nothing. |
| A4 | Multiple report tables | Status is conveyed by **colour alone** (red/amber/green `<span>` text with no icon). Fails WCAG 1.4.1 (Use of Color). |
| A5 | `sidebar-nav.tsx` | Sidebar uses `<a>` (hard navigation) instead of Next.js `<Link>`. This causes a full page reload on every nav click, but also means the active item is not correctly styled until the new page finishes loading. |
| A6 | Hub cards | Cards are `<Link>` blocks with a visible "View report →" text but no `aria-label` — screen readers announce the raw card text blob as the link name. |

---

### 🟡 Content / UX Gaps

| # | Location | Issue |
|---|----------|-------|
| U1 | All individual reports | **No back-navigation breadcrumb.** Once inside a report there is no "← Reports" link; the user must use the sidebar or browser back button. |
| U2 | `dead-stock/page.tsx` | The idle threshold is configurable via `?idle=<days>` URL param, but the UI never exposes it. Users cannot change the 90-day window without editing the URL manually. |
| U3 | `reports/page.tsx` | **Inventory and Purchasing section labels are visually identical** — both use `--brand-dim` / `--brand-1` tokens. Only the System label is distinct. Section labels lose their purpose as visual separators. |
| U4 | All report tables | **No column sorting.** Tables cannot be sorted by any column. On stock-on-hand or movements with hundreds of rows, the user cannot re-order by value, qty, date, etc. |
| U5 | All report tables | **No search or filter.** No way to search by component name, supplier, or any field. |
| U6 | Report tables | **No drill-through links.** Component names, supplier names, and PO numbers in tables are plain text — not links to their respective detail pages. |
| U7 | `inventory-integrity/page.tsx` | Reconciliation issue descriptions show raw floating-point deltas (`on_hand delta: 0.0000, in_prod delta: 0.0000`) with no explanation of what this means or what action to take. |
| U8 | `lead-time-accuracy/page.tsx` | Receipts with no `expected_date` on the PO are counted as on-time. This silently inflates the accuracy figure and is not disclosed to the user. |

---

## Score Matrix

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Usefulness** | 7 / 10 | Covers the core inventory + purchasing loop well. Live stat cards on the hub are genuinely valuable. Dead-stock detection, integrity checks, and lead-time accuracy are above-average for launch. Gaps: no production/BOM reports, no profitability view, no sales-side metrics. |
| **Accessibility** | 3 / 10 | Several structural accessibility gaps: missing table scope attributes, unlabelled date inputs, charts are screen-reader-invisible, colour-only status, and missing breadcrumb/skip navigation. A user relying on assistive technology would struggle significantly. |
| **Ease of Use** | 5 / 10 | Clean, scannable layout with good use of colour coding and hub cards. Significant friction points: "Custom" date filter is broken, no sorting or search on tables, no drill-through to detail pages, no breadcrumb, and the dead-stock threshold is not user-adjustable. |

---

## Easy Wins (Beyond the Findings Above)

These are *additions* that would increase value — not fixes for the issues listed above.

### 1. Column sorting on all report tables
Add a `sortKey` / `sortDir` state (or URL param) to `ReportTable`. One click on any column header sorts ascending; a second click reverses. This is a day's work and immediately makes large tables usable without any backend changes.

### 2. Drill-through links from table rows to entity detail pages
Component names in stock-on-hand, dead-stock, valuation, and movements tables should link to `/app/components/[id]`. Supplier names in spend-by-supplier and lead-time-accuracy should link to `/app/suppliers/[id]`. PO # in po-summary and po-variance should link to the relevant PO detail. This turns reports from read-only summaries into navigation entry points.

### 3. Adjustable dead-stock idle threshold via a UI control
Add a small segmented control or dropdown (`30d · 60d · 90d · 180d`) above the dead-stock table. Update the URL param on change. This makes one of the most operationally useful reports actually configurable without technical knowledge.

### 4. "Last refreshed" timestamp and a manual refresh button
Because reports are server-side-rendered, the user has no indication of data freshness. A simple "Last refreshed: just now" note with a router-refresh button would build trust — especially important for the Inventory Integrity report which people check before acting.

### 5. Summary trend indicator on hub cards (e.g., ↑ / ↓ vs. previous period)
The hub cards show a single current value. Adding a small delta vs. the previous equivalent period (e.g., "↑ 12% vs last month") would turn the hub from a snapshot into a diagnostic view — and requires only one additional query per card.

---

## Notes for Prioritisation

- **Bugs #1, #2, #3, #4** (missing hub title, broken Custom date button, date filter shown but non-functional) should be fixed before launch — they erode trust.
- **Accessibility A1–A4** are quick wins that have meaningful impact on compliance posture.
- **Easy Win #2** (drill-through links) adds the most value per line of code and requires no schema changes.
