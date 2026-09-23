import { NextRequest, NextResponse } from "next/server";
import {
  SessionTokenError,
  extractBearerToken,
  verifyShopifySessionTokenAny,
} from "@/lib/shopify/session-token";
import { signLinkHandoff } from "@/lib/shopify/link-handoff";

/**
 * Mints a short-lived signed handoff so the embedded surface can send a merchant
 * to /shopify-connect to link this shop to a Manuva workspace.
 *
 * A Shopify-managed install never reaches our OAuth callback, so no
 * shopify_pending_install cookie is set and the merchant previously hit a dead
 * end ("this store isn't connected to a Manuva account"). This route is the way
 * out of it. The handoff carries only the shop domain — the access token is
 * captured later by the token-exchange route, once the store row exists.
 *
 * Returns:
 * - 200 { ok: true, handoff, shop }
 * - 401 { error } — invalid or missing session token
 */
export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing-session-token" }, { status: 401 });
  }

  let verified;
  try {
    verified = verifyShopifySessionTokenAny(token);
  } catch (error) {
    const reason = error instanceof SessionTokenError ? error.reason : "verify-failed";
    return NextResponse.json(
      { ok: false, error: `invalid-session-token:${reason}` },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    shop: verified.shop,
    handoff: signLinkHandoff(verified.shop),
  });
}
