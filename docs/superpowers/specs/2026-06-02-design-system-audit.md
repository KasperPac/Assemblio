# Design System Audit — Core App, Reports & Settings

**Date:** 2026-06-02  
**Status:** Approved  
**Scope:** ~40 pages across core app, reports, and settings. Help pages excluded (separate article system planned).

---

## Goal

Audit every page in the core app, reports, and settings sections against the Manuva Design System and fix all violations in-place. No structural redesigns — targeted token/component fixes only.

---

## Scope

### In scope

| Section | Pages |
|---|---|
| **Core App** | components, inventory, purchasing, suppliers, orders, bom, goods-inwards, products, stocktake, warehouse/locations, planning, departments, activity-log, staff-costings, costing, capacity, actual-time, staffing, trash |
| **Reports** | reports index, stock-on-hand, valuation, movements, po-summary, po-variance, lead-time-accuracy, spend-by-supplier, dead-stock, stocktake-history, inventory-integrity |
| **Settings** | settings index, company, appearance, integrations, invoices, profile, team, orders, locations, theme |

### Out of scope

- Help article pages (a new article design system will be defined separately)
- Super-admin pages
- Billing / suspended / upgrade edge-case pages
- Component logic, data fetching, server actions

---

## Approach

Three parallel agents, one per section. Each agent owns its section exclusively — no overlapping files, no concurrent edit conflicts.

Each agent:
1. Reads each page `.tsx` and its co-located `.module.css`
2. Identifies violations against the checklist below
3. Applies minimal targeted fixes
4. Reports a summary table of changes
5. Commits: `fix(design-system): align [section] pages with Manuva design system`

---

## Violation Checklist

### TSX violations

| # | Rule | Fix |
|---|---|---|
| T1 | `PageHeader` missing `eyebrow` | Add correct eyebrow from taxonomy |
| T2 | `PageHeader` missing `title` | Add page title |
| T3 | Empty state uses raw `<p>` or `<div>` | Replace with `<EmptyState title="…" message="…" />` |
| T4 | Status chip is a hand-written `<span>` with inline colour | Replace with `<StatusBadge variant="…">` |
| T5 | `style={{…}}` used for layout or colour | Move to CSS module (exception: truly dynamic values like opacity) |

### CSS violations

| # | Rule | Fix |
|---|---|---|
| C1 | Hardcoded hex colour | Replace with semantic token (`--ok`, `--warning`, `--danger`, `--info`, `--brand-1`) |
| C2 | Hardcoded `rgba(…)` colour | Replace with token or CSS `color-mix()` where appropriate; modal backdrops use `rgba(0,0,0,0.5)` as an acceptable exception |
| C3 | Invented token name (`--border`, `--bg-hover`, `--ink-base`, `--surface-card`, `--radius-base`) | Replace with correct token |
| C4 | `--surface-1` on the card container itself | Replace with `var(--bg-card)`. Note: `--surface-1` is *correct* for items inside a card (rows, pills, nested panels) — do not change those. |
| C5 | Card CSS hand-written (custom border-radius, box-shadow, border) | Replace with `var(--stroke-card)`, `var(--radius-xl)`, `var(--bg-card)`, `var(--shadow-card)` |
| C6 | Table styles hand-written | `composes: table from "../_ui/table.module.css"` |
| C7 | Button styles hand-written | `composes: primary from "../_ui/buttons.module.css"` |

### Do not touch

- Two-column page-level layouts → flag in summary, defer to owner
- Any fix that requires restructuring the page's data flow or server actions

---

## Eyebrow Taxonomy (reference)

| Eyebrow | Pages |
|---|---|
| `"Products"` | Components, Bills of Materials |
| `"Operations"` | Production Orders, Purchasing, Inventory, Goods Inwards, Stocktake, Reports |
| `"Logistics"` | Suppliers, Locations |
| `"Orders"` | Customer Orders |
| `"Admin"` | Settings, Users |

---

## Output Format

Each agent returns:

```
| Page | Violations fixed | Flagged (deferred) |
|---|---|---|
| purchasing/page.tsx | T1: eyebrow added | — |
| components.module.css | C1: #d97706 → var(--warning) | — |
```

---

## Success Criteria

- Every in-scope page passes all T1–T5 checks
- Every in-scope CSS module passes all C1–C7 checks
- No hardcoded hex colours remain in any in-scope file
- All `PageHeader` calls have `eyebrow` and `title`
- Three clean commits land on `main`, one per section
