import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookHmacAny } from "@/lib/shopify/auth";
import { syncShopifyStoreData } from "@/lib/shopify/sync";
import {
  hasWebhookIdentityHeaders,
  isDuplicateWebhookEvent,
  parseWebhookPayload,
  shouldRunStoreSync,
} from "@/lib/shopify/webhook";
import { handleAppUninstalled } from "@/lib/shopify/uninstall";
import { getValidAccessToken } from "@/lib/shopify/token-refresh";

export async function POST(request: NextRequest) {
  const hmac = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shop = request.headers.get("x-shopify-shop-domain") ?? "";
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? "";
  const rawBody = await request.text();

  if (!hmac || !verifyWebhookHmacAny(rawBody, hmac)) {
    return new NextResponse("Invalid webhook signature", { status: 401 });
  }
  if (!hasWebhookIdentityHeaders(topic, shop, webhookId)) {
    return new NextResponse("Missing webhook headers", { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const parsedPayload = parseWebhookPayload(rawBody);
  if (!parsedPayload) {
    return new NextResponse("Invalid webhook payload", { status: 400 });
  }

  const { data: hookEvent, error: hookEventError } = await admin
    .from("shopify_webhook_event")
    .upsert(
      {
        webhook_id: webhookId,
        shop_domain: shop,
        topic,
        payload: parsedPayload,
      },
      { onConflict: "webhook_id", ignoreDuplicates: true }
    )
    .select("id")
    .single();
  if (hookEventError) {
    return new NextResponse("Webhook persistence failed", { status: 500 });
  }

  if (isDuplicateWebhookEvent(hookEvent)) {
    return new NextResponse("Duplicate", { status: 200 });
  }

  const { data: store } = await admin
    .from("shopify_store")
    .select("id,tenant_id")
    .eq("store_domain", shop)
    .maybeSingle();

  if (store?.tenant_id) {
    await admin.from("event_log").insert({
      tenant_id: store.tenant_id,
      event_type: topic,
      payload: parsedPayload,
    });
  }

  if (topic === "app/uninstalled") {
    await handleAppUninstalled(admin, shop);
    // Token was just deleted, so the downstream sync branch will short-circuit
    // via shouldRunStoreSync (no accessToken). Return 200 without further work.
    return new NextResponse("OK", { status: 200 });
  }

  if (store?.id && store?.tenant_id && shouldRunStoreSync({ topic, storeId: store.id, tenantId: store.tenant_id, accessToken: "present" })) {
    let accessToken: string;
    try {
      const tokenSet = await getValidAccessToken(admin, store.tenant_id, shop);
      accessToken = tokenSet.accessToken;
    } catch {
      await admin
        .from("shopify_store")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: "failed",
          last_sync_meta: { fromWebhook: topic, error: "token-refresh-failed" },
        })
        .eq("tenant_id", store.tenant_id)
        .eq("id", store.id);
      return new NextResponse("OK", { status: 200 });
    }
    try {
      const result = await syncShopifyStoreData(
        store.tenant_id,
        shop,
        accessToken
      );
      await admin
        .from("shopify_store")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: "ok",
          last_sync_meta: {
            fromWebhook: topic,
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown-sync-error";
      await admin
        .from("shopify_store")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: "failed",
          last_sync_meta: { fromWebhook: topic, error: message },
        })
        .eq("tenant_id", store.tenant_id)
        .eq("id", store.id);
    }
  }

  return new NextResponse("OK", { status: 200 });
}
