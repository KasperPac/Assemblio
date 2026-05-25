import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shopify GDPR mandatory webhook handlers.
 * Spec: https://shopify.dev/docs/apps/build/privacy-law-compliance
 *
 * Topics:
 * - customers/data_request: merchant has requested a customer's data; we have 30 days to deliver it.
 *   For MVP we log the request and notify the platform owner via activity_log; the operator handles export.
 * - customers/redact: delete a specific customer's PII within 30 days (Shopify fires 10 days after merchant request).
 *   We scrub matching rows in `orders` and any cached payloads in `shopify_webhook_event`.
 * - shop/redact: delete all data for a shop. Shopify fires 48h after app uninstall, on shops with no other apps.
 *   We delete the shop's tokens, webhook events, and shopify-sourced product/order data.
 */

type GdprTopic = "customers/data_request" | "customers/redact" | "shop/redact";

type RequestAuditRow = {
  id: string;
};

type CustomerPayload = {
  shop_id?: number;
  shop_domain?: string;
  customer?: {
    id?: number;
    email?: string;
    phone?: string;
  };
  orders_requested?: number[];
  orders_to_redact?: number[];
  data_request?: { id?: number };
};

type ShopRedactPayload = {
  shop_id?: number;
  shop_domain?: string;
};

export async function logGdprRequest(
  admin: SupabaseClient,
  topic: GdprTopic,
  shopDomain: string,
  webhookId: string | null,
  payload: Record<string, unknown>
): Promise<RequestAuditRow | null> {
  const { data, error } = await admin
    .from("shopify_gdpr_request")
    .insert({
      topic,
      shop_domain: shopDomain,
      webhook_id: webhookId,
      payload,
      status: "received",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[shopify-gdpr] audit insert failed", { topic, shopDomain, error });
    return null;
  }
  return data;
}

export async function markGdprRequestProcessed(
  admin: SupabaseClient,
  id: string,
  status: "completed" | "failed",
  errorMessage?: string
) {
  await admin
    .from("shopify_gdpr_request")
    .update({
      status,
      error: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/**
 * customers/data_request handler.
 * We don't currently persist customer-scoped data outside of webhook payloads and `orders.customer_email`.
 * For MVP we record the request and surface it via activity_log so the platform owner can compile + email
 * the export to the merchant within the 30-day window.
 */
export async function handleCustomersDataRequest(
  admin: SupabaseClient,
  payload: CustomerPayload,
  shopDomain: string
): Promise<{ tenantId: string | null; orderEmailMatches: number }> {
  const customerEmail = payload.customer?.email?.toLowerCase() ?? null;

  const { data: store } = await admin
    .from("shopify_store")
    .select("tenant_id")
    .eq("store_domain", shopDomain)
    .maybeSingle();

  const tenantId = store?.tenant_id ?? null;

  let orderEmailMatches = 0;
  if (tenantId && customerEmail) {
    const { count } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("customer_email", customerEmail);
    orderEmailMatches = count ?? 0;
  }

  if (tenantId) {
    await admin.from("activity_log").insert({
      tenant_id: tenantId,
      event: "SHOPIFY_GDPR_DATA_REQUEST",
      metadata: {
        shop_domain: shopDomain,
        customer_email: customerEmail,
        customer_id: payload.customer?.id ?? null,
        orders_requested: payload.orders_requested ?? [],
        order_email_matches: orderEmailMatches,
      },
    });
  }

  return { tenantId, orderEmailMatches };
}

/**
 * customers/redact handler. Scrubs PII from rows we can attribute to the customer.
 * Match strategy: lowercase email (we don't store the Shopify customer ID on `orders`).
 * Returns counts so the audit log captures what changed.
 */
export async function handleCustomersRedact(
  admin: SupabaseClient,
  payload: CustomerPayload,
  shopDomain: string
): Promise<{ tenantId: string | null; ordersScrubbed: number; webhookEventsScrubbed: number }> {
  const customerEmail = payload.customer?.email?.toLowerCase() ?? null;

  const { data: store } = await admin
    .from("shopify_store")
    .select("tenant_id")
    .eq("store_domain", shopDomain)
    .maybeSingle();

  const tenantId = store?.tenant_id ?? null;
  let ordersScrubbed = 0;
  let webhookEventsScrubbed = 0;

  if (tenantId && customerEmail) {
    const { data: ordersUpdated } = await admin
      .from("orders")
      .update({ customer_email: null })
      .eq("tenant_id", tenantId)
      .eq("customer_email", customerEmail)
      .select("id");
    ordersScrubbed = ordersUpdated?.length ?? 0;

    // Null out the entire payload for webhook events whose customer email matches.
    // We keep the event row (idempotency) and topic but drop the PII blob.
    const { data: webhookEventsUpdated } = await admin
      .from("shopify_webhook_event")
      .update({ payload: { redacted: true, reason: "customers/redact" } })
      .eq("shop_domain", shopDomain)
      .filter("payload->customer->>email", "eq", customerEmail)
      .select("id");
    webhookEventsScrubbed = webhookEventsUpdated?.length ?? 0;
  }

  if (tenantId) {
    await admin.from("activity_log").insert({
      tenant_id: tenantId,
      event: "SHOPIFY_GDPR_CUSTOMER_REDACT",
      metadata: {
        shop_domain: shopDomain,
        customer_email: customerEmail,
        customer_id: payload.customer?.id ?? null,
        orders_scrubbed: ordersScrubbed,
        webhook_events_scrubbed: webhookEventsScrubbed,
      },
    });
  }

  return { tenantId, ordersScrubbed, webhookEventsScrubbed };
}

/**
 * shop/redact handler. Fires 48h after uninstall on shops with no other apps installed.
 * We delete the shop's tokens, webhook events, and all shopify-sourced product/order rows
 * for the tenant — BUT only when the tenant has exactly one Shopify store (this one).
 * If the tenant has multiple stores we cannot safely attribute products/orders to the
 * specific shop with the current schema, so we delete tokens + webhook events only and
 * surface a warning for the operator to handle manually.
 */
export async function handleShopRedact(
  admin: SupabaseClient,
  payload: ShopRedactPayload,
  shopDomainHeader: string
): Promise<{
  tenantId: string | null;
  shopifyStoreDeleted: boolean;
  productsDeleted: number;
  ordersDeleted: number;
  webhookEventsDeleted: number;
  multiStoreSkipped: boolean;
}> {
  const shopDomain = payload.shop_domain ?? shopDomainHeader;

  const { data: store } = await admin
    .from("shopify_store")
    .select("id, tenant_id")
    .eq("store_domain", shopDomain)
    .maybeSingle();

  const tenantId = store?.tenant_id ?? null;
  let productsDeleted = 0;
  let ordersDeleted = 0;
  let shopifyStoreDeleted = false;
  let multiStoreSkipped = false;

  // Delete webhook events for this shop_domain (safe regardless of tenant/store presence).
  const { data: deletedEvents } = await admin
    .from("shopify_webhook_event")
    .delete()
    .eq("shop_domain", shopDomain)
    .select("id");
  const webhookEventsDeleted = deletedEvents?.length ?? 0;

  if (tenantId && store) {
    const { count: storeCount } = await admin
      .from("shopify_store")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const isSoleStore = (storeCount ?? 0) <= 1;

    if (isSoleStore) {
      // Delete order_line first (FK), then orders, then product_variant, then product.
      // All scoped to tenant_id; only shopify-sourced rows for product/variant.
      const { data: orderIds } = await admin
        .from("orders")
        .select("id")
        .eq("tenant_id", tenantId)
        .not("shopify_order_id", "is", null);

      if (orderIds && orderIds.length > 0) {
        const ids = orderIds.map((r) => r.id);
        await admin.from("order_line").delete().in("order_id", ids);
        const { data: deletedOrders } = await admin
          .from("orders")
          .delete()
          .in("id", ids)
          .select("id");
        ordersDeleted = deletedOrders?.length ?? 0;
      }

      const { data: deletedVariants } = await admin
        .from("product_variant")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("source", "shopify")
        .select("id");

      const { data: deletedProducts } = await admin
        .from("product")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("source", "shopify")
        .select("id");

      productsDeleted = (deletedProducts?.length ?? 0) + (deletedVariants?.length ?? 0);
    } else {
      multiStoreSkipped = true;
    }

    // Always delete the shopify_store row + cascade install_tokens.
    const { error: storeDeleteError } = await admin
      .from("shopify_store")
      .delete()
      .eq("id", store.id)
      .eq("tenant_id", tenantId);
    shopifyStoreDeleted = !storeDeleteError;

    await admin.from("activity_log").insert({
      tenant_id: tenantId,
      event: "SHOPIFY_GDPR_SHOP_REDACT",
      metadata: {
        shop_domain: shopDomain,
        shopify_store_deleted: shopifyStoreDeleted,
        products_deleted: productsDeleted,
        orders_deleted: ordersDeleted,
        webhook_events_deleted: webhookEventsDeleted,
        multi_store_skipped: multiStoreSkipped,
      },
    });
  }

  return {
    tenantId,
    shopifyStoreDeleted,
    productsDeleted,
    ordersDeleted,
    webhookEventsDeleted,
    multiStoreSkipped,
  };
}

export type { GdprTopic, CustomerPayload, ShopRedactPayload };
