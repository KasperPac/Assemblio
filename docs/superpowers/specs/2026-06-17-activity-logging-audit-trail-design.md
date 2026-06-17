# Activity Logging — Customer-Facing Audit Trail

**Date:** 2026-06-17
**Status:** Approved design, pending implementation plan

## Problem

The activity log (`/app/activity-log`) is effectively non-functional as an audit trail:

1. **Every actor shows as "Shopify"** — `table.tsx` reads `metadata.user` and falls back to the
   hardcoded string `"Shopify"`. *Nothing in the codebase ever writes `metadata.user`*, so every
   row falls through to that label regardless of who acted or whether Shopify was involved. The same
   hardcoded fallback appears in the filter dropdown, the detail pane, and the avatar.
2. **Only 10 rows, no pagination** — `page.tsx` hardcodes `.limit(10)`. All UI filters
   (search/date/user/event) only narrow those 10 client-side rows; they never query full history.
3. **Most actions are never logged** — only a handful of system/billing/Shopify events insert to
   `activity_log`. Regular business mutations (creating/editing/deleting BOMs, components, POs,
   suppliers, inventory, etc.) write nothing. BOM creation in particular is never logged.

Today only these events exist: `SHOPIFY_SYNC_COMPLETED`, `SHOPIFY_APP_UNINSTALLED`,
`subscription.activated`, `order_allocation_run`, `trash.emptied`, `bom.template_publish`, and a few
super-admin tenant events. None populate `metadata.user`.

## Goals & Decisions

Decided during brainstorming:

- **Purpose:** Customer-facing audit trail — tenants rely on it for accountability ("who changed
  this PO?", "who deleted that BOM?"). Must be reliable, complete across business actions, and
  trustworthy. (Not strict compliance — no immutability/retention guarantees required.)
- **Coverage:** All meaningful mutations (create/update/delete of business records) across every
  domain, plus auth/integration/billing events.
- **Detail level:** Actor + entity + human-readable message. No field-level diffs or full snapshots
  in v1.
- **Actor display:** Real user name/email for user actions; explicit typed labels for automated
  events ("Shopify sync", "Stripe billing", "System"). No blanket "Shopify" fallback.
- **History/paging:** Paged over full history (50/page) with server-side filters that apply to
  everything, not just the loaded page. Keep entries indefinitely.
- **Architecture:** Centralized `logActivity()` helper called explicitly from each server action
  (Approach A), not DB triggers. Human messages, entity context, and typed actors all live in the
  app layer, where triggers are weakest. Completeness is enforced via a typed event catalog + tests.

## Non-Goals (v1)

- CSV/PDF export of the log.
- Retention / auto-purge (keep indefinitely was chosen).
- The separate `event_log` table (out of scope).
- Logging sensitive *reads*/exports (mutations only).
- Field-level diffs or full before/after record snapshots.

## Section 1 — Data model

Additive migration in a new `supabase/patches/` file. No data loss; existing rows keep working
(new columns nullable / defaulted).

Current: `activity_log(id, tenant_id, actor_id, event, metadata, created_at)`.

New shape:

| Column | Status | Notes |
|---|---|---|
| `id` | unchanged | |
| `tenant_id` | unchanged | |
| `actor_id` | unchanged | uuid, nullable; null for system actors |
| `actor_type` | **NEW** | text, `'user' \| 'system' \| 'shopify' \| 'stripe'`, default `'user'` |
| `actor_label` | **NEW** | text, nullable; snapshot of display name at write time |
| `event` | unchanged | text; now drawn from a typed catalog |
| `entity_type` | **NEW** | text, nullable; e.g. `'purchase_order'`, `'bom'`, `'component'` |
| `entity_id` | **NEW** | uuid, nullable; the affected record (null for tenant-wide events) |
| `summary` | **NEW** | text, nullable; human-readable message ("Updated PO-1234") |
| `metadata` | unchanged | jsonb; extra structured detail |
| `created_at` | unchanged | |

Deliberate choices:

- **`actor_label` is snapshotted at write time**, not joined on read. This is an audit trail — if a
  user is renamed or removed, the log must still truthfully say who acted. `actor_id` is also kept
  to link to the live profile when it exists. (`actor_id` references `auth.users` with no cascade,
  so user deletion is otherwise blocked; the snapshot frees us from depending on that.)
- **`entity_type` + `entity_id` as real columns** unlock the audit filters now and a future
  "show all history for this record" view, with proper indexing instead of `metadata->>` probing.

Indexes:

- `(tenant_id, created_at desc)` — paging.
- `(tenant_id, event)` — event filter.
- `(tenant_id, actor_id)` — user filter.
- `(tenant_id, entity_type, entity_id)` — entity filter / future per-record history.

Note: `profiles` carries `full_name`, `avatar_url`, `status` (added via an earlier patch beyond base
`schema.sql`). `actor_id → profiles.full_name` (fallback email) is the user-name source.

## Section 2 — `logActivity` helper + event catalog

New module `src/lib/activity/`.

**`events.ts` — typed catalog.** Single source of truth mapping each event key to its entity type
and a message builder. Prevents typo'd event strings and keeps messages consistent.

```ts
// Illustrative shape
export const ACTIVITY_EVENTS = {
  "purchase_order.created": { entityType: "purchase_order", summary: (m) => `Created ${m.poNumber}` },
  "purchase_order.updated": { entityType: "purchase_order", summary: (m) => `Updated ${m.poNumber}` },
  "bom.created":            { entityType: "bom",            summary: (m) => `Created BOM ${m.name}` },
  // …one entry per meaningful mutation
} as const;

export type ActivityEvent = keyof typeof ACTIVITY_EVENTS;
```

**`log.ts` — the helper.** Called from a server action *after* the mutation succeeds:

```ts
await logActivity({
  event: "purchase_order.updated",
  entityId: po.id,
  metadata: { poNumber: po.number }, // feeds the summary builder + stored as detail
});
```

Behavior:

- Pulls `tenantId` + `actor_id` from `getServerTenantContext()`. Resolves `actor_label` from
  `profiles.full_name` (fallback email). Sets `actor_type: "user"`.
- Derives `entity_type` and `summary` from the catalog so call sites stay terse.
- **System callers** (Shopify sync, Stripe webhooks — no user session, admin client) call a sibling
  `logSystemActivity({ event, actorType: "shopify" | "stripe" | "system", tenantId, ... })`, passing
  tenant explicitly and a fixed label like "Shopify sync".
- **Never throws into the business flow.** Logging failures are caught and logged server-side
  (console error) so a logging bug can't break a PO save.

**Tradeoff (accepted):** "never throw" trades completeness for safety — a swallowed failure is a
silent gap. Given customer-facing (not strict-compliance) intent, safety wins. Mitigated by keeping
the helper dead-simple and unit-testing it.

## Section 3 — Coverage rollout

Audit each `actions.ts` and add a catalog entry + `logActivity` call for every exported mutation.
Rolled out by domain group; exact event keys are verified against each action file during
implementation (not guessed now).

| Domain group | Action files | Example events |
|---|---|---|
| **Products** | components, bom, templates, products | `component.created/updated/deleted`, `bom.created/updated/deleted`, `bom.template_publish` (exists) |
| **Purchasing & inwards** | purchasing, goods-inwards, suppliers, suppliers/[id] | `purchase_order.created/updated/received`, `supplier.created/updated/deleted`, `goods_receipt.created` |
| **Inventory** | inventory, stocktake, stocktake/[id], warehouse/locations | `inventory.adjusted`, `stocktake.opened/counted/closed`, `location.created/updated` |
| **Orders** | orders | `order.allocation_run` (exists), `order.updated` |
| **Production** | planning/floor, capacity, staffing, staff-costings, actual-time, departments, costing | `production.*`, `department.created/updated`, etc. |
| **Settings/admin** | settings/{team,profile,company,orders,locations,integrations} | `team.member_invited/role_changed/removed`, `company.updated`, `integration.connected/disconnected` |
| **Lifecycle** | trash, super-admin, shopify, stripe | `trash.emptied` (exists), tenant suspend/plan (exist), `shopify.sync_completed` (exists), `subscription.activated` (exists) |

Approach notes:

- **Existing ad-hoc inserts are migrated** to the helper (orders, trash, templates, super-admin,
  shopify, stripe) so there is one consistent path, not two. Current behavior is preserved; rows now
  populate the new columns.
- The catalog is the checklist: implementation isn't done until every exported mutation across these
  files either has an event or is a conscious exclusion (pure reads, no-op saves).
- **Deletes/soft-deletes are explicitly in scope** ("who deleted that BOM") — easy to miss, called
  out per domain.

## Section 4 — Read side (pagination, filters, UI)

Rebuild the page as a server-driven, URL-param view so filters and paging apply to full history.

**Query (server component reads `searchParams`):**

- Filters become DB conditions: `event` (eq), `actor_id` (eq), `entity_type` (eq), date range
  (`created_at` gte/lte), text search across `summary` + `actor_label` (`ilike`).
- Paging via `.range(offset, offset + pageSize - 1)`, `pageSize = 50`, plus a `count: "exact"` head
  query for total/page count.
- Default order `created_at desc`. Backed by the Section 1 indexes.

**Filter option sources:** dropdowns populated from complete distinct values for the tenant (events
from the catalog; actors from `profiles` in the tenant) — not from the current page.

**URL state:** filters + page live in the query string (`?event=bom.created&page=2`) — shareable,
bookmarkable, survives refresh.

**UI:** keep the master/detail layout and `_ui` primitives (`PageHeader`, `StatusBadge`,
`EmptyState`). Changes:

- Actor column shows `actor_label`; system actors get a typed chip ("Shopify sync", "Stripe
  billing", "System"). The hardcoded `"Shopify"` fallback is removed entirely.
- Columns map to real fields: date, actor, event badge, entity (type + link to record when
  `entity_id` resolves), summary.
- Pagination control (Prev / Next + "page X of Y") below the table.
- Detail pane: resolved actor, entity (linked), summary, raw `metadata`.
- Design system compliance: single-column `.page`, compose table/buttons from `_ui/`, tokens only
  (no hardcoded colors). Verify the existing custom filter bar / two-column content area composes
  from `_ui` table styles and uses tokens.

## Section 5 — Testing & docs

**Tests** (Vitest, matching existing `*.test.ts` patterns in `lib/shopify`, `lib/stripe`):

- **Helper unit tests** (`src/lib/activity/log.test.ts`): resolves actor from context and snapshots
  `actor_label`; populates `actor_type`/`entity_type`/`summary` from the catalog; `logSystemActivity`
  sets the right typed label with no `actor_id`; **a failing insert is swallowed and does not throw**.
- **Catalog test** (`events.test.ts`): every event key produces a non-empty summary given its
  expected metadata.
- **Read-side test**: filter params translate into expected query conditions; paging math
  (page/total/range) is correct.
- Extend existing Shopify/Stripe tests that assert `activity_log` writes so they pass after those
  inserts route through the helper.

**Docs (required by CLAUDE.md):**

- Update `docs/qa-feature-test-plan.md`: amend the Activity Log feature with new testable behaviors
  (paged full history, server-side filters, real-name + typed system actors, per-domain coverage,
  deletes logged) and add a dated changelog line.
- This design doc committed under `docs/superpowers/specs/`.

## Risks & open questions

- **Coverage drift** — the main risk. New actions added later may forget to log. Mitigation: the
  typed catalog + a documented convention; consider a follow-up lint/check later (not v1).
- **Silent log failures** — accepted tradeoff (Section 2). Re-evaluate if audit completeness later
  becomes a compliance requirement.
- **Volume** — keep-indefinitely + all-mutations will grow the table. Indexes cover query
  performance; retention/purge deferred to a future iteration if size becomes a concern.
