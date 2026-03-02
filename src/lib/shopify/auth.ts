import { createHmac, timingSafeEqual, randomBytes } from "crypto";

const SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

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

export function getShopifyOAuthConfig() {
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? "";
  const scopes = process.env.SHOPIFY_SCOPES ?? "read_products,read_orders";
  const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const appUrl = appUrlRaw.trim().replace(/\/+$/, "");

  if (!apiKey || !apiSecret || !appUrl) {
    return {
      ok: false as const,
      error: "missing-config" as const,
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

export function buildShopifyAuthUrl(shop: string, state: string) {
  const config = getShopifyOAuthConfig();
  if (!config.ok) {
    throw new Error("Shopify OAuth config is missing required environment variables.");
  }
  const { apiKey, scopes, appUrl } = config;
  const redirectUri = `${appUrl}/api/shopify/callback`;
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
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

export function verifyShopifyCallbackHmac(url: URL) {
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;

  const pairs: string[] = [];
  url.searchParams.forEach((value, key) => {
    if (key === "hmac" || key === "signature") return;
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const message = pairs.join("&");
  return verifySignedPayload(message, hmac);
}

export function verifyWebhookHmac(rawBody: string, receivedHmac: string) {
  const secret = process.env.SHOPIFY_API_SECRET ?? "";
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(receivedHmac);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
