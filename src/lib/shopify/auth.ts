import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { OAUTH_SCOPES } from "./scopes";

const SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export type ShopifyAppId = "public" | "unlisted";

export function isValidShopDomain(shop: string) {
  return SHOP_REGEX.test(shop);
}

export function normalizeShopDomain(shop: string) {
  const raw = shop.trim().toLowerCase();
  if (!raw) return "";

  // Accept common user input formats:
  // - your-store.myshopify.com
  // - https://your-store.myshopify.com/admin
  // - your-store.myshopify.com/
  try {
    const parsed = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw)
      : new URL(`https://${raw}`);
    return parsed.hostname.replace(/\.+$/, "");
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .replace(/\.+$/, "");
  }
}

/**
 * Returns true when `appUrl` is acceptable for Shopify use:
 * - In production: must be https://
 * - In dev/test: also allow http://localhost or http://127.0.0.1 (for shopify CLI tunnels not yet up)
 * Shopify itself rejects non-HTTPS callback/webhook URLs, so catching this at config-load
 * surfaces a clear error instead of an opaque webhook registration failure later.
 */
export function isAcceptableAppUrl(appUrl: string): boolean {
  if (!appUrl) return false;
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:" && process.env.NODE_ENV !== "production") {
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    }
    return false;
  } catch {
    return false;
  }
}

export function getShopifyOAuthConfig() {
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? "";
  const scopes = process.env.SHOPIFY_SCOPES ?? OAUTH_SCOPES;
  const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const appUrl = appUrlRaw.trim().replace(/\/+$/, "");

  if (!apiKey || !apiSecret || !appUrl) {
    return {
      ok: false as const,
      error: "missing-config" as const,
    };
  }

  if (!isAcceptableAppUrl(appUrl)) {
    console.error(
      `[shopify] NEXT_PUBLIC_APP_URL must be HTTPS in production (got: ${appUrl}). ` +
        `Shopify will reject all webhook and callback URLs that are not HTTPS.`
    );
    return {
      ok: false as const,
      error: "invalid-app-url" as const,
    };
  }

  return {
    ok: true as const,
    apiKey,
    apiSecret,
    scopes,
    appUrl,
  };
}

/**
 * Returns OAuth credentials for the given app. Use "unlisted" while the public
 * app is pending Shopify review. Requires SHOPIFY_UNLISTED_API_KEY and
 * SHOPIFY_UNLISTED_API_SECRET to be set in env for the unlisted app.
 */
export function getShopifyOAuthConfigForApp(appId: ShopifyAppId) {
  if (appId === "unlisted") {
    const apiKey = process.env.SHOPIFY_UNLISTED_API_KEY ?? "";
    const apiSecret = process.env.SHOPIFY_UNLISTED_API_SECRET ?? "";
    const scopes =
      process.env.SHOPIFY_UNLISTED_SCOPES ??
      process.env.SHOPIFY_SCOPES ??
      "read_products,read_orders";
    const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const appUrl = appUrlRaw.trim().replace(/\/+$/, "");

    if (!apiKey || !apiSecret || !appUrl) {
      return { ok: false as const, error: "missing-config" as const };
    }
    if (!isAcceptableAppUrl(appUrl)) {
      return { ok: false as const, error: "invalid-app-url" as const };
    }
    return { ok: true as const, apiKey, apiSecret, scopes, appUrl };
  }

  return getShopifyOAuthConfig();
}

export function buildShopifyAuthUrl(
  shop: string,
  state: string,
  config?: { apiKey: string; scopes: string; appUrl: string }
) {
  const c = config ?? (() => {
    const cfg = getShopifyOAuthConfig();
    if (!cfg.ok) {
      throw new Error("Shopify OAuth config is missing required environment variables.");
    }
    return cfg;
  })();
  const redirectUri = `${c.appUrl}/api/shopify/callback`;
  const params = new URLSearchParams({
    client_id: c.apiKey,
    scope: c.scopes,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export function generateStateNonce() {
  return randomBytes(16).toString("hex");
}

export function signPayload(payload: string) {
  const secret = process.env.SHOPIFY_API_SECRET ?? "";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifySignedPayload(payload: string, signature: string) {
  const expected = signPayload(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyShopifyCallbackHmac(url: URL, secret?: string) {
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;

  const pairs: string[] = [];
  url.searchParams.forEach((value, key) => {
    if (key === "hmac" || key === "signature") return;
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const message = pairs.join("&");

  const s = secret ?? (process.env.SHOPIFY_API_SECRET ?? "");
  const digest = createHmac("sha256", s).update(message).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyWebhookHmac(rawBody: string, receivedHmac: string, secret?: string) {
  const s = secret ?? (process.env.SHOPIFY_API_SECRET ?? "");
  const digest = createHmac("sha256", s).update(rawBody).digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(receivedHmac);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verifies a webhook HMAC against all configured app secrets. Tries the public
 * app secret first, then the unlisted app secret if set. Use this on all
 * incoming webhook routes so both apps' webhooks are accepted simultaneously.
 */
export function verifyWebhookHmacAny(rawBody: string, receivedHmac: string): boolean {
  if (verifyWebhookHmac(rawBody, receivedHmac)) return true;
  const unlistedSecret = process.env.SHOPIFY_UNLISTED_API_SECRET;
  if (!unlistedSecret) return false;
  return verifyWebhookHmac(rawBody, receivedHmac, unlistedSecret);
}
