import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  SessionTokenError,
  extractBearerToken,
  verifyShopifySessionToken,
} from "@/lib/shopify/session-token";
import { syncShopifyStoreData } from "@/lib/shopify/sync";
import { getMissingSyncScopes } from "@/lib/shopify/scopes";
import { getSubscriptionAccess } from "@/lib/subscription/access";

/**
 * Session-token-authenticated sync trigger for the embedded admin surface.
 * Mirrors `/api/shopify/sync` but accepts Shopify session tokens (Bearer) instead of
 * the Supabase auth cookie, and returns JSON instead of redirecting.
 */
export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing-session-token" }, { status: 401 });
  }

  let verified;
  try {
    verified = verifyShopifySessionToken(token);
  } catch (error) {
    const reason = error instanceof SessionTokenError ? error.reason : "verify-failed";
    return NextResponse.json({ ok: false, error: `invalid-session-token:${reason}` }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: store } = await admin
    .from("shopify_store")
    .select("id, tenant_id, store_domain")
    .eq("store_domain", verified.shop)
    .maybeSingle();

  if (!store) {
    return NextResponse.json({ ok: false, error: "store-not-found" }, { status: 404 });
  }

  const access = await getSubscriptionAccess(admin, store.tenant_id);
  if (access.state !== "ok") {
    return NextResponse.json(
      { ok: false, error: `subscription-${access.state}` },
      { status: 402 }
    );
  }

  const { data: tokenRow } = await admin
    .from("shopify_install_tokens")
    .select("access_token, scopes")
    .eq("tenant_id", store.tenant_id)
    .eq("shopify_store_id", store.id)
    .single();

  if (!tokenRow?.access_token) {
    return NextResponse.json({ ok: false, error: "no-access-token" }, { status: 409 });
  }

  const missingScopes = getMissingSyncScopes(tokenRow.scopes);
  if (missingScopes.length > 0) {
    return NextResponse.json(
      { ok: false, error: "missing-scopes", missing: missingScopes },
      { status: 409 }
    );
  }

  try {
    const result = await syncShopifyStoreData(
      store.tenant_id,
      store.store_domain,
      tokenRow.access_token
    );

    await admin
      .from("shopify_store")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "ok",
        last_sync_meta: {
          source: "embedded",
          products: result.products,
          variants: result.variants,
          orders: result.orders,
          orderLines: result.orderLines,
          allocations: result.allocations,
          plan_runs: result.planRuns,
          plan_errors: result.planErrors,
        },
      })
      .eq("tenant_id", store.tenant_id)
      .eq("id", store.id);

    return NextResponse.json({
      ok: true,
      products: result.products,
      orders: result.orders,
      orderLines: result.orderLines,
    });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "unknown-sync-error";
    await admin
      .from("shopify_store")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "failed",
        last_sync_meta: { source: "embedded", error: message },
      })
      .eq("tenant_id", store.tenant_id)
      .eq("id", store.id);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
