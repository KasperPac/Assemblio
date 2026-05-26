import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Expiring offline access tokens — request, store, and refresh.
 *
 * Shopify deprecated non-expiring offline access tokens. The new flow:
 * - Request with `expiring: true` → response includes access_token (~24h),
 *   refresh_token, and expires_in (seconds).
 * - Before the access_token expires, POST to /admin/oauth/access_token with
 *   grant_type=refresh_token to get a new access_token + new refresh_token.
 *
 * Spec: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens
 */

export type ExpiringTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number; // seconds
  scope?: string;
};

/**
 * Compute an absolute ISO timestamp for when a token expires.
 * Subtracts 60s of safety margin so we refresh just before the wire.
 */
export function expiresAtFrom(expiresInSeconds: number | undefined): string | null {
  if (!expiresInSeconds || expiresInSeconds <= 0) return null;
  return new Date(Date.now() + (expiresInSeconds - 60) * 1000).toISOString();
}

/**
 * Persist an access_token + refresh_token + expires_at onto the shopify_install_tokens
 * row for a given (tenant, shopify_store). Upserts on shopify_store_id.
 */
export async function saveTokenSet(
  admin: SupabaseClient,
  tenantId: string,
  shopifyStoreId: string,
  data: ExpiringTokenResponse
) {
  const expiresAt = expiresAtFrom(data.expires_in);
  return admin
    .from("shopify_install_tokens")
    .upsert(
      {
        tenant_id: tenantId,
        shopify_store_id: shopifyStoreId,
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? null,
        scopes: data.scope ?? null,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shopify_store_id" }
    );
}

/**
 * Exchange a refresh_token for a fresh access_token + (rotated) refresh_token.
 * Throws if Shopify rejects the refresh (e.g. revoked install).
 */
export async function refreshAccessToken(
  shopDomain: string,
  refreshToken: string,
  options: { apiKey?: string; apiSecret?: string } = {}
): Promise<ExpiringTokenResponse> {
  const apiKey = options.apiKey ?? process.env.SHOPIFY_API_KEY ?? "";
  const apiSecret = options.apiSecret ?? process.env.SHOPIFY_API_SECRET ?? "";
  if (!apiKey || !apiSecret) {
    throw new Error("token-refresh: missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET");
  }

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`token-refresh failed (${response.status}): ${body}`);
  }

  return (await response.json()) as ExpiringTokenResponse;
}

/**
 * Returns a non-expired access token for the given (tenant, store), refreshing
 * if necessary. Updates the DB on refresh.
 *
 * - If the stored token has no expires_at (legacy/non-expiring), returns it as-is.
 * - If the stored token expires within the next 5 minutes (or already expired)
 *   and we have a refresh_token, refresh and return the new one.
 * - If refresh fails, surfaces the error — caller should treat as auth failure
 *   requiring re-install.
 */
export async function getValidAccessToken(
  admin: SupabaseClient,
  tenantId: string,
  shopDomain: string
): Promise<{ accessToken: string; scopes: string | null; refreshed: boolean }> {
  const { data: store } = await admin
    .from("shopify_store")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("store_domain", shopDomain)
    .maybeSingle();
  if (!store) throw new Error(`shopify_store row not found for ${shopDomain}`);

  const { data: tok } = await admin
    .from("shopify_install_tokens")
    .select("access_token, refresh_token, scopes, expires_at")
    .eq("shopify_store_id", store.id)
    .maybeSingle();
  if (!tok?.access_token) {
    throw new Error(`No access token for ${shopDomain} — merchant must (re)install the app.`);
  }

  const now = Date.now();
  const expiresAt = tok.expires_at ? new Date(tok.expires_at).getTime() : null;
  const REFRESH_WINDOW_MS = 5 * 60 * 1000;
  const needsRefresh =
    expiresAt !== null && expiresAt - now < REFRESH_WINDOW_MS;

  if (!needsRefresh) {
    return {
      accessToken: tok.access_token,
      scopes: tok.scopes ?? null,
      refreshed: false,
    };
  }

  if (!tok.refresh_token) {
    throw new Error(
      `Access token for ${shopDomain} is expired/expiring and no refresh_token is stored. Merchant must reinstall.`
    );
  }

  const refreshed = await refreshAccessToken(shopDomain, tok.refresh_token);
  await saveTokenSet(admin, tenantId, store.id, {
    ...refreshed,
    // Preserve the previous scope string if the response doesn't include it
    scope: refreshed.scope ?? tok.scopes ?? undefined,
  });
  return {
    accessToken: refreshed.access_token,
    scopes: refreshed.scope ?? tok.scopes ?? null,
    refreshed: true,
  };
}
