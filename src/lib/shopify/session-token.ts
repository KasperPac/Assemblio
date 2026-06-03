import { createHmac, timingSafeEqual } from "crypto";
import type { ShopifyAppId } from "./auth";

/**
 * Verifies a Shopify App Bridge session token (JWT).
 * Spec: https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
 *
 * Session tokens are HS256 JWTs signed with the app's API secret. The embedded surface
 * receives them from App Bridge in the browser and includes them as a Bearer token on
 * fetch requests to our API. The server verifies signature + claims, then trusts that
 * `dest`'s shop is the authenticated merchant for this request.
 */

export type ShopifySessionTokenClaims = {
  /** Issuer — the shop's admin URL, e.g. `https://demo.myshopify.com/admin` */
  iss: string;
  /** Destination — the shop URL, e.g. `https://demo.myshopify.com` */
  dest: string;
  /** Audience — the app's API key (client ID) */
  aud: string;
  /** Subject — the Shopify user ID */
  sub: string;
  /** Expiration (seconds since epoch) */
  exp: number;
  /** Not-before (seconds since epoch) */
  nbf: number;
  /** Issued-at (seconds since epoch) */
  iat: number;
  /** JTI — unique token ID, used for replay protection at the caller's discretion */
  jti?: string;
  /** Session ID derived from cookie at issue time */
  sid?: string;
};

export type VerifiedSessionToken = {
  shop: string;
  claims: ShopifySessionTokenClaims;
};

export type VerifiedSessionTokenAny = VerifiedSessionToken & {
  /** Which configured app the token verified against. */
  appId: ShopifyAppId;
};

export type SessionTokenApp = {
  appId: ShopifyAppId;
  apiKey: string;
  apiSecret: string;
};

const CLOCK_SKEW_SECONDS = 5;

export class SessionTokenError extends Error {
  constructor(public reason: string) {
    super(`session-token: ${reason}`);
    this.name = "SessionTokenError";
  }
}

function base64UrlDecode(input: string): Buffer {
  // Base64URL -> Base64
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function base64UrlDecodeToString(input: string): string {
  return base64UrlDecode(input).toString("utf8");
}

/**
 * Verifies a Shopify session token and returns its claims + extracted shop domain.
 * Throws SessionTokenError on any failure.
 */
export function verifyShopifySessionToken(
  token: string,
  options: {
    apiKey?: string;
    apiSecret?: string;
    nowSeconds?: number;
  } = {}
): VerifiedSessionToken {
  if (!token || typeof token !== "string") {
    throw new SessionTokenError("missing-token");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new SessionTokenError("malformed-jwt");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
  } catch {
    throw new SessionTokenError("invalid-header");
  }
  if (header.alg !== "HS256") {
    throw new SessionTokenError("unsupported-alg");
  }

  const apiSecret = options.apiSecret ?? process.env.SHOPIFY_API_SECRET ?? "";
  const apiKey = options.apiKey ?? process.env.SHOPIFY_API_KEY ?? "";
  if (!apiSecret || !apiKey) {
    throw new SessionTokenError("missing-app-credentials");
  }

  const expectedSig = createHmac("sha256", apiSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const providedSig = base64UrlDecode(signatureB64);
  if (
    expectedSig.length !== providedSig.length ||
    !timingSafeEqual(expectedSig, providedSig)
  ) {
    throw new SessionTokenError("bad-signature");
  }

  let claims: ShopifySessionTokenClaims;
  try {
    claims = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    throw new SessionTokenError("invalid-payload");
  }

  if (claims.aud !== apiKey) {
    throw new SessionTokenError("aud-mismatch");
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) {
    throw new SessionTokenError("expired");
  }
  if (typeof claims.nbf !== "number" || claims.nbf - CLOCK_SKEW_SECONDS > now) {
    throw new SessionTokenError("not-yet-valid");
  }

  if (typeof claims.dest !== "string" || typeof claims.iss !== "string") {
    throw new SessionTokenError("missing-iss-or-dest");
  }

  let destUrl: URL;
  let issUrl: URL;
  try {
    destUrl = new URL(claims.dest);
    issUrl = new URL(claims.iss);
  } catch {
    throw new SessionTokenError("invalid-iss-or-dest");
  }

  // Same hostname (the merchant's shop), and iss must be the admin path under dest.
  if (destUrl.hostname !== issUrl.hostname) {
    throw new SessionTokenError("iss-dest-host-mismatch");
  }
  if (destUrl.protocol !== "https:") {
    throw new SessionTokenError("dest-not-https");
  }

  const shop = destUrl.hostname.toLowerCase();
  // Shopify session tokens always come from a *.myshopify.com shop.
  if (!shop.endsWith(".myshopify.com")) {
    throw new SessionTokenError("not-a-shopify-shop");
  }

  return { shop, claims };
}

/**
 * Returns the list of apps whose credentials are configured, in priority order:
 * the public app first, then the unlisted app if SHOPIFY_UNLISTED_* are set.
 * Mirrors verifyWebhookHmacAny() in auth.ts, which accepts webhooks from either app.
 */
function configuredSessionTokenApps(): SessionTokenApp[] {
  const apps: SessionTokenApp[] = [];
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? "";
  if (apiKey && apiSecret) {
    apps.push({ appId: "public", apiKey, apiSecret });
  }
  const unlistedKey = process.env.SHOPIFY_UNLISTED_API_KEY ?? "";
  const unlistedSecret = process.env.SHOPIFY_UNLISTED_API_SECRET ?? "";
  if (unlistedKey && unlistedSecret) {
    apps.push({ appId: "unlisted", apiKey: unlistedKey, apiSecret: unlistedSecret });
  }
  return apps;
}

/**
 * Verifies a Shopify session token against any configured app (public or unlisted)
 * and reports which app it matched. Used by the embedded surface, which serves both
 * the public "Manuva" app and the unlisted "Manuva Fab" app at the same URL — the
 * token's signature + aud determine which app the merchant actually installed.
 *
 * Each candidate is tried via verifyShopifySessionToken, which checks the HS256
 * signature (with that app's secret) before aud, so a token only "matches" an app
 * whose secret signed it. Throws SessionTokenError if no configured app matches.
 */
export function verifyShopifySessionTokenAny(
  token: string,
  options: { apps?: SessionTokenApp[]; nowSeconds?: number } = {}
): VerifiedSessionTokenAny {
  const apps = options.apps ?? configuredSessionTokenApps();
  if (apps.length === 0) {
    throw new SessionTokenError("missing-app-credentials");
  }

  let lastError: unknown;
  for (const app of apps) {
    try {
      const verified = verifyShopifySessionToken(token, {
        apiKey: app.apiKey,
        apiSecret: app.apiSecret,
        nowSeconds: options.nowSeconds,
      });
      return { ...verified, appId: app.appId };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof SessionTokenError
    ? lastError
    : new SessionTokenError("verify-failed");
}

/**
 * Extracts a session token from an Authorization header.
 * Returns the bare token (without the "Bearer " prefix), or null if not present.
 */
export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1].trim() : null;
}
