import { verifyPendingInstall } from "@/lib/shopify/pending-install";
import { verifyLinkHandoff } from "@/lib/shopify/link-handoff";

/**
 * Where a /shopify-connect visit came from.
 *
 * "pending" is the traditional OAuth callback path: the cookie carries an
 * access token we already hold. "handoff" is a Shopify-managed install, which
 * skips our callback entirely — we know the shop (signed, from a verified App
 * Bridge session token) but hold no token yet. The embedded surface captures
 * one via token-exchange once the store row exists.
 */
export type LinkSource =
  | {
      mode: "pending";
      shop: string;
      accessToken: string;
      scopes: string;
      refreshToken: string | null;
      expiresInSeconds: number | null;
    }
  | { mode: "handoff"; shop: string }
  | null;

export function resolveLinkSource(
  cookieValue: string,
  handoffParam: string | null
): LinkSource {
  // The cookie wins: it carries an access token, so linking from it needs no
  // follow-up token-exchange.
  const pending = verifyPendingInstall(cookieValue);
  if (pending) {
    return {
      mode: "pending",
      shop: pending.shop,
      accessToken: pending.accessToken,
      scopes: pending.scopes,
      refreshToken: pending.refreshToken,
      expiresInSeconds: pending.expiresInSeconds,
    };
  }

  if (handoffParam) {
    const handoff = verifyLinkHandoff(handoffParam);
    if (handoff) return { mode: "handoff", shop: handoff.shop };
  }

  return null;
}
