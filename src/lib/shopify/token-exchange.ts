/**
 * Shopify Token Exchange — modern embedded-app auth.
 *
 * Exchanges an App Bridge session token (JWT) for an offline access token via
 * Shopify's token-exchange grant. Required for apps installed via Shopify-managed
 * install (the App Store install path) since those don't go through our
 * traditional OAuth code-for-token callback.
 *
 * Spec: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange
 */

export type TokenExchangeResult = {
  accessToken: string;
  scope: string;
  expiresIn?: number;
  refreshToken?: string;
};

export type TokenExchangeError = {
  status: number;
  body: string;
};

export async function exchangeSessionTokenForOfflineAccessToken(
  shopDomain: string,
  sessionToken: string,
  options: { apiKey?: string; apiSecret?: string } = {}
): Promise<TokenExchangeResult> {
  const apiKey = options.apiKey ?? process.env.SHOPIFY_API_KEY ?? "";
  const apiSecret = options.apiSecret ?? process.env.SHOPIFY_API_SECRET ?? "";
  if (!apiKey || !apiSecret) {
    throw new Error("token-exchange: missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET");
  }

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: sessionToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      // Shopify defaults to non-expiring tokens, which are deprecated and now
      // rejected at API time. expiring=1 (literal integer per Shopify docs)
      // returns an expiring access token + refresh token.
      expiring: 1,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    const err: TokenExchangeError = { status: response.status, body };
    throw Object.assign(new Error(`token-exchange failed (${response.status}): ${body}`), err);
  }

  const data = (await response.json()) as {
    access_token?: string;
    scope?: string;
    expires_in?: number;
    refresh_token?: string;
  };

  if (!data.access_token || !data.scope) {
    throw new Error(`token-exchange: malformed response (missing access_token or scope)`);
  }

  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token,
  };
}
