import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  SessionTokenError,
  extractBearerToken,
  verifyShopifySessionTokenAny,
} from "@/lib/shopify/session-token";
import { exchangeSessionTokenForOfflineAccessToken } from "@/lib/shopify/token-exchange";
import { getShopifyOAuthConfigForApp } from "@/lib/shopify/auth";
import { registerRequiredWebhooks } from "@/lib/shopify/client";

/**
 * Exchanges the App Bridge session token for an offline access token and stores it
 * against the existing shopify_store row for the shop. Required for Shopify-managed
 * (embedded) installs that don't go through our traditional OAuth callback.
 *
 * Returns:
 * - 200 { ok: true, scopes } — token saved, ready to sync
 * - 401 { error } — invalid or missing session token
 * - 404 { error: "no-tenant-association" } — shop not yet linked to a Manuva tenant;
 *   caller should send the merchant to /api/shopify/auth to associate first
 * - 500 { error } — token exchange or DB save failed
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
    return NextResponse.json({ ok: false, error: `invalid-session-token:${reason}` }, { status: 401 });
  }

  const shop = verified.shop;

  // Exchange using the credentials of the app the token actually came from
  // (public "Manuva" vs unlisted "Manuva Fab"). Using the wrong app's client
  // credentials makes Shopify reject the exchange with an invalid-token error.
  const appConfig = getShopifyOAuthConfigForApp(verified.appId);
  if (!appConfig.ok) {
    return NextResponse.json(
      { ok: false, error: `app-config-missing:${verified.appId}` },
      { status: 500 }
    );
  }
  const admin = createSupabaseAdminClient();

  const { data: store } = await admin
    .from("shopify_store")
    .select("id, tenant_id")
    .eq("store_domain", shop)
    .maybeSingle();

  if (!store) {
    return NextResponse.json(
      { ok: false, error: "no-tenant-association", shop },
      { status: 404 }
    );
  }

  let exchange;
  try {
    exchange = await exchangeSessionTokenForOfflineAccessToken(shop, token, {
      apiKey: appConfig.apiKey,
      apiSecret: appConfig.apiSecret,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "token-exchange-failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const expiresAt =
    exchange.expiresIn && exchange.expiresIn > 0
      ? new Date(Date.now() + (exchange.expiresIn - 60) * 1000).toISOString()
      : null;

  const { error: upsertError } = await admin
    .from("shopify_install_tokens")
    .upsert(
      {
        tenant_id: store.tenant_id,
        shopify_store_id: store.id,
        access_token: exchange.accessToken,
        refresh_token: exchange.refreshToken ?? null,
        expires_at: expiresAt,
        scopes: exchange.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shopify_store_id" }
    );

  if (upsertError) {
    return NextResponse.json(
      { ok: false, error: `token-save-failed: ${upsertError.message}` },
      { status: 500 }
    );
  }

  // Best-effort: register operational webhooks. Safe to retry if previously failed.
  try {
    await registerRequiredWebhooks(shop, exchange.accessToken);
  } catch (error) {
    // Webhook registration failure is not fatal — log and continue.
    console.warn(
      `[token-exchange] webhook registration failed for ${shop}: ${
        error instanceof Error ? error.message : "unknown"
      }`
    );
  }

  return NextResponse.json({
    ok: true,
    shop,
    scopes: exchange.scope,
  });
}
