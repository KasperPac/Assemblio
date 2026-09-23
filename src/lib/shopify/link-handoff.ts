import { createHmac, timingSafeEqual } from "crypto";
import { isValidShopDomain } from "./auth";

/**
 * Short-lived signed handoff that carries a shop domain from the embedded
 * surface to /shopify-connect.
 *
 * Deliberately NOT a pending install: the payload is the shop domain and an
 * expiry, never an access token. A Shopify-managed install skips our OAuth
 * callback, so there is no access token to hand over at this point anyway —
 * the embedded surface captures one via token-exchange once the store row
 * exists. Keeping the token out means this value is safe in a URL and needs
 * no cookie, which matters because the embedded surface is a third-party
 * frame where cookies are unreliable.
 *
 * The signature proves the shop came from a verified App Bridge session token,
 * so a merchant cannot link a shop they do not control by editing the URL.
 */
export const LINK_HANDOFF_TTL_MS = 5 * 60 * 1000;

type HandoffPayload = { shop: string; exp: number };

export function signLinkHandoff(shop: string): string {
  const payload: HandoffPayload = { shop, exp: Date.now() + LINK_HANDOFF_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = process.env.SHOPIFY_API_SECRET ?? "";
  const sig = createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${sig}`;
}

export function verifyLinkHandoff(handoff: string): { shop: string } | null {
  const dotIndex = handoff.lastIndexOf(".");
  if (dotIndex <= 0) return null;

  const encoded = handoff.slice(0, dotIndex);
  const receivedSig = handoff.slice(dotIndex + 1);
  if (!encoded || !receivedSig) return null;

  const secret = process.env.SHOPIFY_API_SECRET ?? "";
  const expectedSig = createHmac("sha256", secret).update(encoded).digest("hex");

  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(expectedSig, "hex");
    b = Buffer.from(receivedSig, "hex");
  } catch {
    return null;
  }
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  let payload: Partial<HandoffPayload>;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.shop !== "string" || typeof payload.exp !== "number") return null;
  if (Date.now() > payload.exp) return null;
  // Belt and braces: a signed payload should already be trustworthy, but the
  // shop is interpolated into URLs and queries downstream.
  if (!isValidShopDomain(payload.shop)) return null;

  return { shop: payload.shop };
}
