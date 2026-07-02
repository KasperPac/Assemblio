import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphqlRequest } from "./client";
import { reconcileOrderAllocations, releaseOrderAllocations } from "@/lib/allocation/reconcile-order";
import { resolveOrderDate, isHistoricalOrder } from "./order-dates";
import { getWeekStart } from "@/lib/dates";
import { mapProductStatus } from "./product-status";
import { logSystemActivity } from "@/lib/activity/log";
import { normalizeProductCategories } from "./product-categories";

type SyncResult = {
  products: number;
  variants: number;
  orders: number;
  orderLines: number;
  allocations: number;
  planRuns: number;
  planErrors: number;
};

type ShopifyProductNode = {
  id: string;
  title: string;
  description: string;
  status: string | null;
  featuredImage: { url: string | null } | null;
  productType: string | null;
  tags: string[] | null;
  category: { name: string | null; fullName: string | null } | null;
  collections: { nodes: Array<{ id: string; title: string; handle: string | null }> } | null;
  variants: { nodes: Array<{ id: string; title: string | null; sku: string | null; price: string | null }> };
};

type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  processedAt: string | null;
  updatedAt: string | null;
  cancelledAt: string | null;
  displayFulfillmentStatus: string | null;
  lineItems: {
    nodes: Array<{
      id: string;
      quantity: number;
      variant: { id: string } | null;
      originalUnitPriceSet: { shopMoney: { amount: string } } | null;
    }>;
  };
  fulfillments: Array<{
    createdAt: string;
    fulfillmentLineItems: { nodes: Array<{ lineItem: { id: string } | null }> };
  }>;
};

type ProductsQueryResult = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyProductNode[];
  };
};

type OrdersQueryResult = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyOrderNode[];
  };
};

function assertNoError(
  error: { message?: string } | null,
  context: string
) {
  if (!error) return;
  throw new Error(`${context}: ${error.message ?? "Unknown Supabase error"}`);
}

// Upserts products and returns a shopify_id -> local id map built from the rows
// the upsert returns, avoiding a follow-up .in() select (which would 414 on
// large catalogs).
async function upsertProducts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  rows: Array<{
    tenant_id: string;
    shopify_id: string;
    title: string;
    description: string;
    image_url: string | null;
    status: string;
    product_type: string | null;
    tags: string[];
    category_name: string | null;
    category_full_name: string | null;
  }>
): Promise<Map<string, string>> {
  const now = new Date().toISOString();
  const sourcedRows = rows.map((row) => ({
    ...row,
    source: "shopify" as const,
    last_synced_at: now,
  }));
  const { data, error } = await admin
    .from("product")
    .upsert(sourcedRows, { onConflict: "tenant_id,shopify_id" })
    .select("id,shopify_id");
  assertNoError(error, "Failed to upsert product");
  return new Map((data ?? []).map((p) => [p.shopify_id as string, p.id as string]));
}

function mapOrderStatus(order: ShopifyOrderNode) {
  if (order.cancelledAt) return "cancelled";
  const status = (order.displayFulfillmentStatus ?? "").toUpperCase();
  if (status === "FULFILLED") {
    return "fulfilled";
  }
  return "open";
}

async function fetchProducts(shopDomain: string, accessToken: string) {
  const products: ShopifyProductNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  const query = `
    query Products($cursor: String) {
      products(first: 50, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title
          description
          status
          featuredImage { url }
          productType
          tags
          category { name fullName }
          collections(first: 50) { nodes { id title handle } }
          variants(first: 100) {
            nodes { id title sku price }
          }
        }
      }
    }
  `;

  while (hasNextPage) {
    const data: ProductsQueryResult = await shopifyGraphqlRequest<ProductsQueryResult>(
      shopDomain,
      accessToken,
      query,
      { cursor }
    );

    products.push(...data.products.nodes);
    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }

  return products;
}

async function fetchOrders(shopDomain: string, accessToken: string) {
  const orders: ShopifyOrderNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  const query = `
    query Orders($cursor: String) {
      orders(first: 50, after: $cursor, reverse: true, sortKey: UPDATED_AT) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          name
          createdAt
          processedAt
          updatedAt
          cancelledAt
          displayFulfillmentStatus
          lineItems(first: 100) {
            nodes {
              id
              quantity
              originalUnitPriceSet { shopMoney { amount } }
              variant { id }
            }
          }
          fulfillments(first: 10) {
            createdAt
            fulfillmentLineItems(first: 100) { nodes { lineItem { id } } }
          }
        }
      }
    }
  `;

  // Paginates the full order history (no cap). Acceptable at current volumes;
  // incremental sync is a tracked follow-up in the spec
  // (docs/superpowers/specs/2026-06-04-shopify-order-dates-and-historical-design.md).
  while (hasNextPage) {
    const data: OrdersQueryResult = await shopifyGraphqlRequest<OrdersQueryResult>(
      shopDomain,
      accessToken,
      query,
      { cursor }
    );

    orders.push(...data.orders.nodes);
    hasNextPage = data.orders.pageInfo.hasNextPage;
    cursor = data.orders.pageInfo.endCursor;
  }

  return orders;
}

export async function syncShopifyStoreData(
  tenantId: string,
  shopDomain: string,
  accessToken: string
): Promise<SyncResult> {
  const admin = createSupabaseAdminClient();

  const { data: storeRow } = await admin
    .from("shopify_store")
    .select("stats_only_before")
    .eq("tenant_id", tenantId)
    .eq("store_domain", shopDomain)
    .maybeSingle();
  const statsOnlyBefore = (storeRow?.stats_only_before as string | null) ?? null;

  const [products, orders] = await Promise.all([
    fetchProducts(shopDomain, accessToken),
    fetchOrders(shopDomain, accessToken),
  ]);

  const normalizedByShopifyId = new Map<
    string,
    ReturnType<typeof normalizeProductCategories>
  >();
  for (const product of products) {
    normalizedByShopifyId.set(product.id, normalizeProductCategories(product));
  }

  let productMap = new Map<string, string>();
  if (products.length > 0) {
    productMap = await upsertProducts(
      admin,
      products.map((product) => {
        const cats = normalizedByShopifyId.get(product.id)!;
        return {
          tenant_id: tenantId,
          shopify_id: product.id,
          title: product.title,
          description: product.description,
          image_url: product.featuredImage?.url ?? null,
          status: mapProductStatus(product.status),
          product_type: cats.productType,
          tags: cats.tags,
          category_name: cats.categoryName,
          category_full_name: cats.categoryFullName,
        };
      })
    );
  }

  // Collections: upsert distinct collections, then rebuild membership per product.
  if (products.length > 0) {
    const collectionByShopifyId = new Map<
      string,
      { tenant_id: string; shopify_id: string; title: string; handle: string | null }
    >();
    for (const cats of normalizedByShopifyId.values()) {
      for (const c of cats.collections) {
        if (!collectionByShopifyId.has(c.shopifyId)) {
          collectionByShopifyId.set(c.shopifyId, {
            tenant_id: tenantId,
            shopify_id: c.shopifyId,
            title: c.title,
            handle: c.handle,
          });
        }
      }
    }

    const collectionIdMap = new Map<string, string>();
    if (collectionByShopifyId.size > 0) {
      const { data: savedCollections, error } = await admin
        .from("shopify_collection")
        .upsert(Array.from(collectionByShopifyId.values()), {
          onConflict: "tenant_id,shopify_id",
        })
        .select("id,shopify_id");
      assertNoError(error, "Failed to upsert shopify_collection");
      for (const row of savedCollections ?? []) {
        collectionIdMap.set(row.shopify_id as string, row.id as string);
      }
    }

    // Rebuild product_collection for every synced product (each appears once).
    const localProductIds = Array.from(productMap.values());
    if (localProductIds.length > 0) {
      const { error: delError } = await admin
        .from("product_collection")
        .delete()
        .eq("tenant_id", tenantId)
        .in("product_id", localProductIds);
      assertNoError(delError, "Failed to clear product_collection");
    }

    const membershipRows: Array<{
      tenant_id: string;
      product_id: string;
      collection_id: string;
    }> = [];
    for (const [shopifyProductId, localProductId] of productMap.entries()) {
      const cats = normalizedByShopifyId.get(shopifyProductId);
      if (!cats) continue;
      for (const c of cats.collections) {
        const localCollectionId = collectionIdMap.get(c.shopifyId);
        if (localCollectionId) {
          membershipRows.push({
            tenant_id: tenantId,
            product_id: localProductId,
            collection_id: localCollectionId,
          });
        }
      }
    }
    if (membershipRows.length > 0) {
      const { error: insError } = await admin
        .from("product_collection")
        .insert(membershipRows);
      assertNoError(insError, "Failed to insert product_collection");
    }
  }

  const variantRows = products.flatMap((product) =>
    product.variants.nodes
      .map((variant) => ({
        tenant_id: tenantId,
        product_id: productMap.get(product.id) ?? "",
        shopify_id: variant.id,
        title: variant.title ?? "",
        sku: variant.sku,
        price: variant.price ? parseFloat(variant.price) : null,
        source: "shopify" as const,
      }))
      .filter((variant) => variant.product_id)
  );

  let variantMap = new Map<string, string>();
  if (variantRows.length > 0) {
    const { data: savedVariants, error } = await admin
      .from("product_variant")
      .upsert(variantRows, { onConflict: "tenant_id,shopify_id" })
      .select("id,shopify_id");
    assertNoError(error, "Failed to upsert product_variant");
    variantMap = new Map((savedVariants ?? []).map((v) => [v.shopify_id as string, v.id as string]));
  }

  const orderRows = orders.map((order) => {
    const orderDate = resolveOrderDate(order.processedAt, order.createdAt);
    // Compute fulfilled_at: earliest fulfillment createdAt, or null if none
    const fulfillmentDates = order.fulfillments
      .map((f) => f.createdAt)
      .filter(Boolean)
      .sort();
    const fulfilledAt = fulfillmentDates.length > 0 ? fulfillmentDates[0] : null;

    return {
      tenant_id: tenantId,
      shopify_order_id: order.id,
      order_number: order.name,
      status: mapOrderStatus(order),
      // Customer fields are deferred until a future feature: querying them
      // requires the read_customers (protected customer data) scope, which the
      // app does not request at launch. Synced as null for now.
      customer_email: null,
      customer_first_name: null,
      shopify_created_at: order.createdAt,
      shopify_processed_at: order.processedAt,
      shopify_updated_at: order.updatedAt,
      fulfilled_at: fulfilledAt,
      historical: isHistoricalOrder(orderDate, statsOnlyBefore),
    };
  });

  let orderMap = new Map<string, string>();
  if (orderRows.length > 0) {
    const { data: savedOrders, error } = await admin
      .from("orders")
      .upsert(orderRows, { onConflict: "tenant_id,shopify_order_id" })
      .select("id,shopify_order_id");
    assertNoError(error, "Failed to upsert orders");
    orderMap = new Map((savedOrders ?? []).map((o) => [o.shopify_order_id as string, o.id as string]));
  }

  const orderLineRows = orders.flatMap((order) => {
    const orderId = orderMap.get(order.id);
    if (!orderId) return [];

    // Build a map from Shopify line item id -> Shopify variant id
    const lineItemToVariant = new Map<string, string>();
    for (const lineItem of order.lineItems.nodes) {
      if (lineItem.variant?.id) {
        lineItemToVariant.set(lineItem.id, lineItem.variant.id);
      }
    }

    // Build shippedByVariant: local variant id -> earliest fulfillment createdAt
    const shippedByVariant = new Map<string, string>();
    for (const fulfillment of order.fulfillments) {
      for (const node of fulfillment.fulfillmentLineItems.nodes) {
        const lineItemId = node.lineItem?.id;
        if (!lineItemId) continue;
        const shopifyVariantId = lineItemToVariant.get(lineItemId);
        if (!shopifyVariantId) continue;
        const localVariantId = variantMap.get(shopifyVariantId);
        if (!localVariantId) continue;
        // Shopify does not guarantee fulfillment order; keep the minimum createdAt.
        const existing = shippedByVariant.get(localVariantId);
        if (!existing || fulfillment.createdAt < existing) {
          shippedByVariant.set(localVariantId, fulfillment.createdAt);
        }
      }
    }

    const lineDataByVariant = new Map<string, { quantity: number; revenue: number }>();
    for (const lineItem of order.lineItems.nodes) {
      const variantId = lineItem.variant?.id;
      const localVariantId = variantId ? variantMap.get(variantId) : undefined;
      if (!localVariantId) continue;
      const unitPrice = parseFloat(lineItem.originalUnitPriceSet?.shopMoney?.amount ?? "0");
      const existing = lineDataByVariant.get(localVariantId) ?? { quantity: 0, revenue: 0 };
      lineDataByVariant.set(localVariantId, {
        quantity: existing.quantity + lineItem.quantity,
        revenue: existing.revenue + unitPrice * lineItem.quantity,
      });
    }

    return Array.from(lineDataByVariant.entries()).map(([variantId, data]) => ({
      tenant_id: tenantId,
      order_id: orderId,
      variant_id: variantId,
      quantity: data.quantity,
      unit_sell_price: data.quantity > 0 ? data.revenue / data.quantity : 0,
      line_sell_price: data.revenue,
      shipped_at: shippedByVariant.get(variantId) ?? null,
    }));
  });

  // Build order_id -> line ids from the upsert's returned rows (used below for
  // financial planning), avoiding a follow-up .in() select that would 414.
  const linesByOrderId = new Map<string, string[]>();
  if (orderLineRows.length > 0) {
    const { data: savedLines, error } = await admin
      .from("order_line")
      .upsert(orderLineRows, { onConflict: "tenant_id,order_id,variant_id" })
      .select("id,order_id");
    assertNoError(error, "Failed to upsert order_line");
    for (const row of savedLines ?? []) {
      const list = linesByOrderId.get(row.order_id as string) ?? [];
      list.push(row.id as string);
      linesByOrderId.set(row.order_id as string, list);
    }
  }

  // Partition orders: live orders get allocation reconciliation and financial
  // planning; historical orders get their reservations released.
  const orderLocalIds = Array.from(new Set(orderLineRows.map((row) => row.order_id)));
  const historicalLocalIds = orderRows
    .filter((r) => r.historical)
    .map((r) => orderMap.get(r.shopify_order_id))
    .filter((id): id is string => Boolean(id));
  const historicalSet = new Set(historicalLocalIds);
  const liveOrderLocalIds = orderLocalIds.filter((id) => !historicalSet.has(id));

  let allocationRuns = 0;
  for (const localOrderId of liveOrderLocalIds) {
    try {
      await reconcileOrderAllocations(admin, tenantId, localOrderId);
      allocationRuns += 1;
    } catch {
      continue;
    }
  }

  // Run financial planning from the line-id map built at upsert time
  let planRuns = 0;
  let planErrors = 0;
  const weekStart = getWeekStart();
  for (const localOrderId of liveOrderLocalIds) {
    for (const lineId of linesByOrderId.get(localOrderId) ?? []) {
      try {
        await admin.rpc("generate_job_financial_plan", {
          p_order_line_id: lineId,
          p_start_week: weekStart,
        });
        planRuns += 1;
      } catch {
        planErrors += 1;
        continue;
      }
    }
  }

  // Release any stock reservations for historical orders (idempotent)
  for (const localOrderId of historicalLocalIds) {
    try {
      await releaseOrderAllocations(admin, tenantId, localOrderId);
    } catch (err) {
      console.error(`[shopify-sync] releaseOrderAllocations failed for ${localOrderId}:`, err instanceof Error ? err.message : err);
      continue;
    }
  }

  await logSystemActivity({
    supabase: admin,
    tenantId,
    event: "shopify.sync_completed",
    actorType: "shopify",
    actorLabel: "Shopify sync",
    metadata: {
      shop_domain: shopDomain,
      products: products.length,
      variants: variantRows.length,
      orders: orderRows.length,
      order_lines: orderLineRows.length,
      allocation_runs: allocationRuns,
      plan_runs: planRuns,
      plan_errors: planErrors,
    },
  });

  return {
    products: products.length,
    variants: variantRows.length,
    orders: orderRows.length,
    orderLines: orderLineRows.length,
    allocations: allocationRuns,
    planRuns,
    planErrors,
  };
}
