# Handover — Shopify sync noise in the activity log

**Date:** 2026-06-19
**Status:** RESOLVED 2026-09-02 — options 1 and 3 implemented together (see
"Resolution" at the bottom). Option 2 was deliberately not taken.

**Original status:** Investigation complete, no code changes yet. Pick a fix option below.

## Problem

The activity log fills with a near-constant stream of `shopify.sync_completed`
("Shopify sync") entries. The user noticed this and asked why.

## Root cause

It's working as designed, but the design is chatty. The chain is:

**Shopify webhook → full store sync → one `shopify.sync_completed` activity row.**

1. **Webhooks trigger a full sync, not an incremental one.** Six topics run a sync
   (`src/lib/shopify/webhook.ts:1`, `SHOPIFY_SYNC_TOPICS`):
   - `orders/create`, `orders/updated`, `orders/cancelled`, `orders/fulfilled`
   - `products/create`, `products/update`

   Any one of these calls `syncShopifyStoreData(...)`, which re-pulls products +
   orders for the whole store (`src/app/api/shopify/webhooks/route.ts:76-98`).

2. **Every completed sync writes an activity entry.** At the end of
   `syncShopifyStoreData`, it logs a `shopify.sync_completed` event to
   `activity_log` with `actorType: "shopify"` (`src/lib/shopify/sync.ts:416`).
   So one webhook = one "Shopify sync" line in the log.

### The amplifier: `orders/updated`

`orders/updated` is by far the noisiest Shopify topic. Shopify fires it for almost
*any* change to an order — payment capture, fulfillment, tag edits, note edits,
risk/fraud analysis completing, even its own internal touches. Each fires the
webhook → full store sync → another logged row. A single order's lifecycle can
produce 5–10 `shopify.sync_completed` entries. Nothing is looping or broken; a
high-frequency webhook is just bound to a full-store sync that always logs.

## Key files

- `src/lib/shopify/webhook.ts` — `SHOPIFY_SYNC_TOPICS`, `shouldRunStoreSync()`
- `src/app/api/shopify/webhooks/route.ts` — webhook handler; runs sync at line 76-98
- `src/lib/shopify/sync.ts:416` — `logSystemActivity({ event: "shopify.sync_completed", ... })`
- `src/app/api/shopify/sync/route.ts` — manual sync (cookie auth, redirects)
- `src/app/api/shopify/embedded/sync/route.ts` — manual sync (session token, JSON)
- `src/lib/activity/log.ts` — `logSystemActivity` helper

## Fix options (independent levers — not yet decided)

1. **Stop logging routine webhook syncs.** Only write `shopify.sync_completed` for
   manual/embedded syncs, or downgrade webhook-driven syncs to a quieter event /
   metadata flag. Smallest change; directly kills the log noise. Likely needs a
   `source`/`fromWebhook` flag threaded into `syncShopifyStoreData` so it knows
   whether to log.

2. **Drop or narrow `orders/updated`** from `SHOPIFY_SYNC_TOPICS`. It's the main
   driver. Rely on `orders/create` / `orders/fulfilled` / `orders/cancelled` for
   the state changes that actually matter. Risk: misses non-lifecycle edits.

3. **Debounce / coalesce syncs.** Skip a sync if one ran for the store within the
   last N seconds (the webhook already records `last_synced_at`), so a burst of
   `orders/updated` collapses into one sync + one log row.

## Suggested next steps

- Optionally query the prod Assemblio DB to confirm which topics dominate:
  count `activity_log` rows by `metadata->>'fromWebhook'` / event over a recent
  window. (Supabase MCP `execute_sql` against project "assemblio".)
- Then implement one of the options above.
- **Per `CLAUDE.md`:** any feature change must update `docs/qa-feature-test-plan.md`
  (feature checklist + dated changelog line) in the same commit.

## Notes / gotchas

- Don't use `git stash` in this repo (a deleted supabase patch file corrupts stash
  ops). Use `git diff` / `git show`.
- Activity-log audit trail feature is already merged to local `main` (was unpushed
  as of the prior session) and the migration is applied to prod.

---

## Resolution (2026-09-02)

Implemented options **1 (stop logging routine webhook syncs)** and **3 (debounce)**
together, scoped to the two chatty topics rather than applied across the board.
Option 2 (dropping `orders/updated`) was rejected: it would lose real order edits.

`SHOPIFY_QUIET_SYNC_TOPICS = { orders/updated, products/update }` in
`src/lib/shopify/webhook.ts`:

- **`shouldLogSyncActivity(topic)`** — quiet topics write no `shopify.sync_completed`
  row. Lifecycle topics (`orders/create`, `cancelled`, `fulfilled`, `products/create`)
  still do, now carrying `trigger` and `webhook_topic` in the metadata. Manual and
  embedded syncs always log, unchanged.
- **`shouldDebounceSync({ topic, lastSyncedAt })`** — a quiet topic skips the full
  store sync entirely if one completed within `QUIET_SYNC_DEBOUNCE_MS` (60s), so a
  burst of `orders/updated` collapses to one sync. Lifecycle topics are never
  debounced, so order and product freshness is unaffected. A bad or future
  timestamp fails open rather than wedging syncing off.
- `syncShopifyStoreData` takes a `SyncOptions` argument (`logActivity`, `trigger`,
  `webhookTopic`); it defaults to logging, so the manual-sync callers were untouched.

Nothing is lost from the audit trail: `event_log` still records every webhook, and
`shopify_store.last_synced_at` / `last_sync_meta` still record every sync outcome.

This also cuts real load — the amplifier was a *full store re-pull* per webhook,
not just a log line.

Covered by 7 new cases in `src/lib/shopify/webhook.test.ts`. Suite: 557 passing.
