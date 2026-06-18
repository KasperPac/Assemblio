# Activity log — People / System (actor) stream split

**Date:** 2026-06-19
**Status:** Design approved, ready for plan.

## Problem

The activity log mixes human ("user") actions with high-frequency automated
entries — chiefly `shopify.sync_completed`, which a single Shopify order's
lifecycle can emit 5–10 times via the `orders/updated` webhook. The human audit
trail is buried under system noise.

Rather than suppress or debounce the system entries (the options weighed in
`docs/handover-shopify-sync-activity-noise.md`), we keep every log row and split
the **view** into separate streams so each audience sees a clean list.

## Goal

Add three tabs to `/app/activity-log` — **People**, **System**, **All** —
that filter the existing log by `actor_type`. Default to **People** so the human
audit trail is clean on load. No change to what gets logged.

## Existing data model (no schema change)

`activity_log.actor_type` already exists with values
`"user" | "system" | "shopify" | "stripe"` (`src/lib/activity/events.ts:1`).
- `logActivity` writes `actor_type: "user"` for human actions (`src/lib/activity/log.ts:37`).
- `logSystemActivity` writes `"shopify" | "stripe" | "system"` for automated actions
  (`src/lib/activity/log.ts:63`).

The split is therefore a pure query/UI concern.

## Approach (chosen)

**Server-side tab via a URL param.** A `?tab=people|system|all` param drives an
`actor_type` filter applied to *both* the rows query and the count query in
`page.tsx`, so pagination (50/page) and the total count stay correct per tab.
Tabs are `<Link>`s reusing the established `.tabBar` pattern from
`src/app/app/templates/page.tsx:220`.

Rejected alternatives:
- **Client-side filtering of fetched rows** — breaks server-side pagination
  (half-empty pages, wrong counts).
- **Separate routes** (`/people`, `/system`) — duplicates page/query/table for no
  gain over a param.

## Tab → query mapping

Applied in `page.tsx` inside (or alongside) the existing `applyFilters`, so the
rows query and count query stay in sync:

| Tab | Filter |
|---|---|
| `people` (default) | `.eq("actor_type", "user")` |
| `system` | `.neq("actor_type", "user")` (covers shopify, stripe, system) |
| `all` | no `actor_type` filter |

## Components / changes

### `src/lib/activity/query.ts`
- Add `tab: ActivityTab` to `ActivityFilters`, where
  `type ActivityTab = "all" | "people" | "system"`.
- `parseActivityFilters` reads `params.tab`; any value other than `all`/`system`
  (including missing) normalizes to `people` (the default).

### `src/app/app/activity-log/page.tsx`
- Read `filters.tab` and apply the actor_type filter above to both `rowsQuery`
  and `countQuery`.
- Pass `tab` through to the client component (already passes `filters`, so it is
  available via `filters.tab` — no new prop strictly required).

### `src/app/app/activity-log/table.tsx`
- Render a `.tabBar` with three `<Link>`s (People / System / All) above the
  existing `.filters` row. Active state from `filters.tab`.
- Tab links preserve the current query string but drop `page` (reset to page 1),
  consistent with the existing `pushParams(..., resetPage=true)` behavior. Build
  the href from the current `searchParams` with `tab` set and `page` removed.
- Hide the "All users" actor `<select>` when `filters.tab === "system"` (a user
  filter is meaningless for automated rows).
- Per-tab `EmptyState` message:
  - people → "No people activity yet" / "Actions taken by your team will appear here."
  - system → "No system activity recorded yet" / "Automated events (Shopify, billing) will appear here."
  - all → existing "No activity found" message.
- No change to `actorDisplay` or the `auto` chip — they already render
  non-user rows correctly, so the System tab works as-is.

### `src/app/app/activity-log/activity-log.module.css`
- Add `.tabBar`, `.tab`, `.tabActive` mirroring the `templates.module.css`
  pattern (caps-label tabs with active underline/colour). No new shared component
  — staying with the current per-page convention.

## Out of scope

- No change to logging volume or behavior: `shopify.sync_completed` is still
  written on every webhook-driven sync. The handover's suppression / topic-drop /
  debounce options are explicitly **not** taken here.
- No schema migration.

## Testing

- `query.ts` is pure → unit test `parseActivityFilters`:
  - missing `tab` → `people`
  - `tab=system` → `system`, `tab=all` → `all`, garbage → `people`
- Manual / QA checklist (see docs update below): default load shows People;
  System tab shows only shopify/stripe/system rows; All shows everything; counts
  and paging are correct per tab; other filters (date/search/event) compose with
  the active tab; switching tabs resets to page 1.

## Docs (required by CLAUDE.md)

Update `docs/qa-feature-test-plan.md` in the same change:
- Amend the Activity Log feature entry with the three-tab behavior and `- [ ]`
  checks (default People, per-tab actor_type filtering, counts/paging per tab).
- Append a `## Changelog` line:
  `- 2026-06-19 — amended Activity Log: People/System/All tabs split log by actor_type (default People).`
