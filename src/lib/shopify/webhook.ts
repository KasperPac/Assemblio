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
