export const SHOPIFY_SYNC_TOPICS = new Set([
  "orders/create",
  "orders/updated",
  "orders/cancelled",
  "orders/fulfilled",
  "products/create",
  "products/update",
]);

export function isSyncTopic(topic: string) {
  return SHOPIFY_SYNC_TOPICS.has(topic);
}

export function isDuplicateWebhookEvent(hookEvent: { id: string } | null) {
  return !hookEvent?.id;
}

export function hasWebhookIdentityHeaders(topic: string, shop: string, webhookId: string) {
  return Boolean(topic && shop && webhookId);
}

export function parseWebhookPayload(rawBody: string) {
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function shouldRunStoreSync(input: {
  topic: string;
  storeId?: string | null;
  tenantId?: string | null;
  accessToken?: string | null;
}) {
  return Boolean(
    input.storeId &&
      input.tenantId &&
      input.accessToken &&
      isSyncTopic(input.topic)
  );
}

/**
 * Topics Shopify fires for near-any touch of a record — payment capture,
 * fulfilment, tag/note edits, risk analysis completing, its own internal
 * writes. Each one drove a full store sync AND an activity-log row, so a
 * single order's lifecycle produced 5-10 "Shopify sync" entries.
 *
 * These still sync (the data matters), they just do it quietly and at most
 * once per DEBOUNCE window.
 */
export const SHOPIFY_QUIET_SYNC_TOPICS = new Set([
  "orders/updated",
  "products/update",
]);

/** How long a quiet topic waits behind the store's last completed sync. */
export const QUIET_SYNC_DEBOUNCE_MS = 60_000;

/**
 * Whether a webhook-driven sync should write a `shopify.sync_completed`
 * activity row. Lifecycle topics (an order placed, cancelled, fulfilled; a
 * product created) are worth an audit line; the chatty ones are not.
 *
 * Nothing is lost when this returns false: the webhook itself is recorded in
 * `event_log`, and `shopify_store.last_synced_at` / `last_sync_meta` carry
 * the sync outcome.
 */
export function shouldLogSyncActivity(topic: string): boolean {
  return !SHOPIFY_QUIET_SYNC_TOPICS.has(topic);
}

/**
 * Whether to skip a full store sync because a recent one already covered it.
 * Only ever debounces the quiet topics — a real lifecycle event always syncs
 * immediately, so order/product freshness is unaffected.
 */
export function shouldDebounceSync(input: {
  topic: string;
  lastSyncedAt?: string | Date | null;
  now?: Date;
  windowMs?: number;
}): boolean {
  if (!SHOPIFY_QUIET_SYNC_TOPICS.has(input.topic)) return false;
  if (!input.lastSyncedAt) return false;

  const last = new Date(input.lastSyncedAt).getTime();
  if (Number.isNaN(last)) return false;

  const now = (input.now ?? new Date()).getTime();
  const windowMs = input.windowMs ?? QUIET_SYNC_DEBOUNCE_MS;
  const elapsed = now - last;

  // A clock skew or a future timestamp should not wedge syncing off forever.
  if (elapsed < 0) return false;
  return elapsed < windowMs;
}
