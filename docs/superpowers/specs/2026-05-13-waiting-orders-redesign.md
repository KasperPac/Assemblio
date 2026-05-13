# Waiting Orders Redesign — Design Spec

**Date:** 2026-05-13
**Scope:** `/app/planning/floor` — the "Waiting orders" panel and the path a job takes from waiting → started.
**Status:** Approved by user, ready for implementation plan.

## Problem

The current "Waiting orders" panel on the floor page is a flex-wrapped row of small cards showing order number, product, qty, and a Start button. Three concrete pain points:

1. **No order date** — it's impossible to tell which order has been waiting longest.
2. **No way to prioritise** — every line looks equally important, so urgent work isn't surfaced.
3. **No visual grouping by order** — multiple products belonging to order #1100 appear as separate, unrelated cards. Operators can rush one product and miss that two more are due for the same customer order.

## Goals

- Make it obvious which order to start next, by date and by importance.
- Let users mark an order (or a single line) as Urgent / Normal / Low.
- Visually keep all lines of the same order together so operators can't miss siblings.
- Carry priority forward onto the board after a job is started.

## Non-goals

- Drag-to-reorder within a priority band.
- Sorting/filtering department columns by priority on the board (only a visual ribbon).
- Exposing priority anywhere outside the floor page (orders list, reports, etc.).

## Layout

The panel becomes a **collapsible left rail** on the floor page.

- **Open (default):** ~360 px wide column, alongside the department board on the right. Independently scrollable so it never pushes the board down.
- **Collapsed:** thin vertical strip with the count badge. Clicking re-opens.
- **Responsive fallback (< 1280 px viewport):** rail falls back to a top-of-page section (current behaviour) so nothing is hidden behind a too-small screen.
- **Header:** `Waiting orders · 7` and a chevron toggle.
- **Empty state:** "All orders are in progress" message in the rail body.

CSS implementation: a CSS grid on the floor page wrapping rail + board, with a media query at 1280 px that collapses the grid to a single column.

## Order card (the grouping unit)

One card per **order**, containing all unstarted lines for that order. Siblings are visually inseparable.

Anatomy:

```
┌─────────────────────────────────────────────┐
│  #1100        12 May · 3 days ago    [⚑ ▾]  │
│  ACME Pty Ltd                                │
├─────────────────────────────────────────────┤
│  ● Widget A      Qty 4    [⚑] [ Start ]     │
│  ● Widget B      Qty 2    [⚑] [ Start ]     │
│  ● Bracket Kit   Qty 1    [⚑] [ Start ]     │
└─────────────────────────────────────────────┘
```

Card elements:

- **Header:** order number, order date (absolute + relative hint), priority pill, customer email on a muted second line. (Schema today only stores `customer_email` on `orders` — a customer-name field can replace it later without UI changes.)
- **Left-edge colour stripe** echoing the effective priority (red / neutral / grey) for at-a-glance scanning.
- **Effective priority pill:** `max(line.priority)` over the order's unstarted lines. Click → menu: *Set all lines to: Urgent / Normal / Low* (bulk action).
- **Per-line flag (⚑):** sets that line's priority independently. Visual states: filled red (Urgent), neutral (Normal), faded down-arrow (Low).
- **Start button per line:** opens the existing `StartJobModal` (no behaviour change there).
- **Age signals on the date:** the relative date hint turns amber after 7 days waiting and red after 14 days, regardless of priority. This surfaces neglected orders that nobody flagged.

## Sort

Order cards in the rail are sorted:

1. Effective priority: Urgent → Normal → Low.
2. Within each priority band: oldest `order.created_at` first.

Intent: "do the most important thing, break ties by age."

## Priority storage

Add `priority smallint not null default 0` to `public.order_line`.

Numeric mapping (chosen so future granularity is non-breaking):

- `2` — Urgent
- `0` — Normal (default)
- `-1` — Low

The UI only exposes the three labels.

Index for the rail query:

```sql
create index if not exists idx_order_line_tenant_priority
  on public.order_line (tenant_id, priority desc, created_at);
```

`job_routing_step.priority` already exists in schema — no change there.

## Server-side data flow

In `src/app/app/planning/(gated)/floor/page.tsx`:

- The unstarted-lines query gains `priority`, `created_at` (from `order_line`), and `customer_email` from the joined `orders` row.
- Build a new `UnstartedOrder[]` shape grouping lines by `order_id`:
  ```ts
  type UnstartedOrder = {
    orderId: string;
    orderNumber: string;
    customerName: string | null;
    orderDate: string;
    lines: UnstartedLine[]; // gains: priority
    effectivePriority: number; // max of lines
  };
  ```
- Sort orders by `effectivePriority desc, orderDate asc` server-side before passing to the rail.

## Server actions

In `src/app/app/planning/(gated)/floor/actions.ts`:

- `setOrderLinePriority(orderLineId: string, priority: number)` — RLS-scoped update on `order_line`. Validates `priority ∈ {-1, 0, 2}`.
- `setOrderPriority(orderId: string, priority: number)` — bulk update of all `order_line` rows belonging to that order for the current tenant. Single round-trip.
- `startJob(...)` (existing) — extended: when inserting `job_routing_step` rows, copy `order_line.priority` into each row's `priority` column.

All three log an entry in `activity_log` with appropriate `event` strings (`order_line.priority_set`, `order.priority_set`, existing `job.start`).

## Components

Replace the existing `unstarted-panel.tsx` with a small component family:

- `waiting-rail.tsx` — collapsible shell. Owns the open/closed state and the count badge. Handles responsive fallback.
- `order-card.tsx` — one card per order. Owns optimistic state for its lines' priorities and for the effective-priority pill. Renders the header, customer line, stripe, and the list of line rows.
- `order-line-row.tsx` — single line. Renders name + qty + per-line flag + Start button (opens the existing `StartJobModal`).
- `priority-pill.tsx`, `priority-flag.tsx` — small shared primitives. Both use design-system tokens (`--brand-1`, `--ink-strong`, etc.) — no hardcoded colors.

The existing `StartJobModal` is unchanged; only the action it calls is extended (priority copy).

`floor.module.css` gains:

- Rail + board grid layout.
- Responsive breakpoint at 1280 px.
- Stripe / age-colour rules.

## Behavior details

- **Optimistic UI:** priority changes (pill or flag) flip immediately. The server action confirms in the background. On failure, revert + show a toast.
- **Effective-priority recompute:** when a per-line flag changes, the order-card recomputes its effective priority client-side so the pill, stripe, and the card's position can update without a full refetch. Server-side ordering re-establishes on next page load.
- **Last line started:** when starting the final unstarted line of an order, the whole order card disappears from the rail.
- **Board ribbon:** job cards on the department board gain a small red ribbon when their step's `priority >= 2`. Sorting inside columns is not affected.

## Edge cases

- Order with zero unstarted lines: not rendered (already filtered upstream).
- Order with mixed priorities: header pill shows the max; per-line flags show each line's own value; bulk action overwrites all.
- Priority change on a line that's racing with a "start" click: the start action reads `order_line.priority` at the moment of insert, so the most-recent value wins. No reconciliation needed.
- Multi-tenant: all three server actions go through `getServerTenantContext()` and rely on RLS — `order_line` and `orders` already have tenant scoping.

## File touch list

New:

- `src/app/app/planning/(gated)/floor/waiting-rail.tsx`
- `src/app/app/planning/(gated)/floor/order-card.tsx`
- `src/app/app/planning/(gated)/floor/order-line-row.tsx`
- `src/app/app/planning/(gated)/floor/priority-pill.tsx`
- `src/app/app/planning/(gated)/floor/priority-flag.tsx`
- `supabase/patches/order_line_priority.sql` (column + index)

Modified:

- `src/app/app/planning/(gated)/floor/page.tsx` (query, grouping, sort, props)
- `src/app/app/planning/(gated)/floor/floor.module.css` (grid + responsive + stripes/ages)
- `src/app/app/planning/(gated)/floor/actions.ts` (`setOrderLinePriority`, `setOrderPriority`, extend `startJob`)
- `src/app/app/planning/(gated)/floor/job-card.tsx` (small priority ribbon when `priority >= 2`)
- `supabase/schema.sql` (mirror the column + index from the patch)

Removed:

- `src/app/app/planning/(gated)/floor/unstarted-panel.tsx`
