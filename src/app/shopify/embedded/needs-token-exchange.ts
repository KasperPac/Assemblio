/**
 * Embedded session shape, narrowed to what the token-exchange decision needs.
 * The full response (with storeId/shopDomain/etc.) is structurally assignable.
 */
export type EmbeddedSessionForExchange =
  | { status: "not-installed" }
  | { status: "no-subscription" | "past_due_locked" | "ok"; hasToken: boolean };

/**
 * True when the embedded surface should run token-exchange to capture an access
 * token: either the shop has no store row yet (not-installed), or it is linked to
 * a tenant but we hold no token (Shopify-managed installs skip our OAuth callback).
 */
export function needsTokenExchange(session: EmbeddedSessionForExchange): boolean {
  if (session.status === "not-installed") return true;
  return !session.hasToken;
}
