# Stocktake Redesign — Design Spec

## Overview

Full redesign of the stocktake feature to meet industry-standard MRP inventory count workflows. Key additions: multi-page navigation, bin location grouping, pre-loaded component lines, initial stock count onboarding wizard, blind count mode, variance reconciliation with reason codes, print-per-section sheets, and CSV import/export.

---

## Feature Set (v1 scope)

- **Initial stock count** — one-time onboarding wizard to establish opening inventory balances
- **Enriched session header** — reference number, session type, notes, blind count toggle, approved_by, approved_at
- **Enriched line fields** — variance %, cost per unit, extended variance $, counted_by, counted_at, notes, variance reason
- **Blind count mode** — suppress expected qty from counter during counting; revealed at reconciliation
- **Variance reconciliation screen** — pre-approval manager review sorted by $ impact, with reason codes and comments
- **CSV export/import** — export lines to spreadsheet, import counted quantities back
- **Variance reason codes** — seeded list (Damage, Theft, Data Entry Error, Found Stock, Supplier Shortage, Other) with free-form comment; comment required when reason is "Other"
- **Bin location on components** — optional `bin_sub_location`, `bin_row`, `bin_bay` fields on `component`; stocktake lines grouped and sorted by bin
- **Print-per-section sheets** — printer-friendly page per bay, sub-location, or full session; blind-count-aware

Deferred: cycle counts, mobile app, RFID, lot/serial/expiry tracking.

---

## Routes

| Route | Purpose |
|---|---|
| `/app/stocktake` | Session list with onboarding banner |
| `/app/stocktake/[sessionId]` | Session detail — counting or reconciliation view |
| `/app/stocktake/[sessionId]/print` | Print-friendly sheet, scoped by query params |

Print query params: `?sublocation=Main+Floor`, `?sublocation=Main+Floor&row=1&bay=3`, or no params (full session).

---

## Data Model

### `stocktake_session` — new columns

| Column | Type | Notes |
|---|---|---|
| `reference_number` | text | Auto-generated per tenant, e.g. `ST-2026-001`. Unique per tenant. |
| `session_type` | text | `'initial'` or `'full'`. Default `'full'`. |
| `notes` | text nullable | Free-form session notes. |
| `blind_count` | boolean | Default `false`. When true, expected qty hidden from counter. |
| `approved_by` | uuid → profiles | Set on approval. |
| `approved_at` | timestamptz | Set on approval. |

### `stocktake_line` — new columns

| Column | Type | Notes |
|---|---|---|
| `notes` | text nullable | Free-form line notes / reconciliation comment. |
| `counted_by` | uuid → profiles | Who entered the count. |
| `counted_at` | timestamptz | When counted. |
| `variance_reason_id` | uuid → stocktake_variance_reason | Set during reconciliation. |

### New table: `stocktake_variance_reason`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `tenant_id` | uuid → tenants |
| `name` | text |
| `sort_order` | int |

Seeded defaults (per tenant on creation): Damage, Theft, Data Entry Error, Found Stock, Supplier Shortage, Other.

### `component` — new columns (bin location)

| Column | Type | Notes |
|---|---|---|
| `bin_sub_location` | text nullable | e.g. `'Main Floor'`, `'Upstairs'` |
| `bin_row` | text nullable | e.g. `'R1'`, `'3'` |
| `bin_bay` | text nullable | e.g. `'B3'`, `'7'` |

Multiple components share a bay. All three fields are optional. Components with no bin assigned appear at the bottom of the counting view under "No location set".

### Session lifecycle

```
draft → open → counting → reconciliation → approved → completed
```

- `draft`: session created, not yet started
- `open`: session started, available for counting
- `counting`: lines are being entered
- `reconciliation`: submitted for manager review; counter can no longer edit
- `approved`: manager approved; `approved_by` and `approved_at` set
- `completed`: `apply_stocktake_session` RPC fired; `inventory_balance.on_hand` updated

Initial-type sessions skip reconciliation: `counting → completed` directly.

---

## Session List Page (`/app/stocktake`)

- Lists all sessions ordered by `created_at` desc
- Columns: Reference, Type, Location, Date, Lines, Status
- Completed sessions dimmed; show "View" instead of "Open"
- **Onboarding banner**: shown when `inventory_balance.on_hand = 0` for all components in the tenant. Disappears permanently once any stock is applied. Banner CTA: "Start initial count →" opens the initial count setup modal.
- **"+ New stocktake" button**: opens the same setup modal as the initial count wizard, but with `session_type = 'full'` pre-selected and blind count default off. Creates the session and redirects to session detail in `counting` status.

---

## Session Detail Page (`/app/stocktake/[sessionId]`)

### Header (all statuses)
- Back link, reference number, status badge, session type badge
- Location, date, submitted-by (when applicable)
- Session notes (if set)
- Action buttons vary by status (see below)

### Counting view (status: `counting`)

- All components pre-loaded as lines when session is created (snapshot of current `on_hand` as expected qty)
- Lines grouped by `bin_sub_location → bin_row → bin_bay`, then alphabetically by name
- Each bay group is collapsible; fully-counted bays show green checkmark and collapse
- Components with no bin assigned appear at bottom under "No location set"
- Inline qty input on each row (not a separate add form)
- **Blind count mode**: expected qty column hidden; revealed at reconciliation
- Progress: "X / Y counted" in header
- Summary bar: lines counted, lines with variance, net variance $
- Action buttons: "Export CSV", "Import CSV", "Submit for review →" (moves to reconciliation)

### Reconciliation view (status: `reconciliation`)

- Only variance lines shown (sorted by absolute dollar impact, descending)
- Columns: Component, Expected, Counted, Variance, Var %, Value (AUD)
- Below each variance line: reason dropdown + comment input (side by side)
  - Reason required before approving
  - Comment required when reason is "Other", optional otherwise
- Zero-variance lines collapsed with count + "View all ↓" toggle
- Summary cards: lines with variance, stock gains $, stock losses $, net adjustment $
- Action buttons: "Send back for recount" (returns to counting), "Approve & apply →"
  - Approve blocked until all variance lines have a reason set

### Initial count view (status: `counting`, session_type: `initial`)

- Same counting UI but no "Expected" column — column header is "On-hand count"
- Info banner: "Initial count — enter the quantity currently on your shelf for each item."
- "Apply opening stock →" button (replaces "Submit for review") — disabled until all lines counted
- On click: confirmation modal showing total component count + total inventory value → "Apply opening stock" fires RPC, marks session completed

---

## Initial Stock Count Wizard

Triggered by "Start initial count →" on the onboarding banner.

**Step 1 — Setup modal** (overlays the list page):
- Location dropdown
- Notes field (optional)
- Blind count toggle (default: on — recommended for initial counts)
- "Start counting →" creates the session and redirects to session detail

**Step 2 — Counting** (session detail, initial type):
- All components listed, no expected qty
- Staff count each item and enter on-hand quantity
- Can be done section-by-section using print sheets

**Step 3 — Apply**:
- No reconciliation step
- Confirmation modal: total components counted, total inventory value
- On confirm: sets `inventory_balance.on_hand` for all components, marks session completed, banner removed

---

## Print View (`/app/stocktake/[sessionId]/print`)

Three scopes (controlled by query params):
- **Bay sheet**: `?sublocation=X&row=Y&bay=Z` — fits on 1–2 pages
- **Sub-location sheet**: `?sublocation=X` — all bays in one section
- **Full session**: no params

Print sheet contents:
- Header: "ASSEMBLIO — STOCKTAKE SHEET", session reference, session type, location, date, section label
- Counter name field (blank line) + signature field
- Table: Component | SKU | Expected | Counted (blank line) | Notes (blank line)
- Footer: blind count notice if applicable
- **Blind count aware**: Expected column blank when `blind_count = true`

Implemented as a separate Next.js route with `@media print` CSS — white background, no sidebar, no nav.

Trigger: "Print sheet" button on each bay header, sub-location header, and session header.

---

## CSV Export / Import

**Export**: downloads all lines for the session as CSV with columns: Component, SKU, Sub-location, Row, Bay, Expected, Counted, Notes. Available during `counting` and `reconciliation` statuses.

**Import**: uploads a CSV with Counted and Notes columns filled in. Matched by SKU. Overwrites existing counted quantities. Available during `counting` status only.

---

## Component Bin Location (UI)

Bin location fields (`bin_sub_location`, `bin_row`, `bin_bay`) are set on the component detail page — not on the stocktake itself. A "Bin location" section on `/app/components/[componentId]` with three optional text inputs.

---

## Existing RPC

`apply_stocktake_session` — already exists. Fires on:
- Full sessions: `approved → completed` transition
- Initial sessions: `counting → completed` transition (no approval step)

The RPC must be checked for status guards. If it currently asserts `status = 'approved'`, a conditional bypass is needed for `session_type = 'initial'` so it accepts `status = 'counting'` for initial sessions. The implementer must verify this before wiring the "Apply opening stock" button.

---

## Role-Based Access

| Action | Member | Admin | Super Admin |
|---|---|---|---|
| View sessions | ✓ | ✓ | ✓ |
| Create session / count lines | ✓ | ✓ | ✓ |
| Approve & apply | — | ✓ | ✓ |
| Manage variance reason codes | — | ✓ | ✓ |
