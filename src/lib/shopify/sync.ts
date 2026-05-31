import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphqlRequest } from "./client";
import { reconcileOrderAllocations } from "@/lib/allocation/reconcile-order";
import { getWeekStart } from "@/lib/dates";

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
  featuredImage: { url: string | null } | null;
  variants: { nodes: Array<{ id: string; title: string | null; sku: string | null; price: string | null }> };
};

type ShopifyOrderNode = {
  id: string;
  name: string;
  cancelledAt: string | null;
  displayFulfillmentStatus: string | null;
  lineItems: {
    nodes: Array<{
      quantity: number;
      variant: { id: string } | null;
      originalUnitPriceSet: { shopMoney: { amount: string } } | null;
    }>;
  };
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

async function upsertProducts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  rows: Array<{
    tenant_id: string;
    shopify_id: string;
    title: string;
    description: string;
    image_url: string | null;
  }>
) {
  const now = new Date().toISOString();
  const sourcedRows = rows.map((row) => ({
    ...row,
    source: "shopify" as const,
    last_synced_at: now,
  }));
  const { error } = await admin
    .from("product")
    .upsert(sourcedRows, { onConflict: "tenant_id,shopify_id" });
  assertNoError(error, "Failed to upsert product");
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
          featuredImage { url }
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
          cancelledAt
          displayFulfillmentStatus
          lineItems(first: 100) {
            nodes {
              quantity
              originalUnitPriceSet { shopMoney { amount } }
              variant { id }
            }
          }
        }
      }
    }
  `;

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
    if (orders.length >= 250) break;
  }

  return orders;
}

export async function syncShopifyStoreData(
  tenantId: string,
  shopDomain: string,
  accessToken: string
): Promise<SyncResult> {
  const admin = createSupabaseAdminClient();
  const [products, orders] = await Promise.all([
    fetchProducts(shopDomain, accessToken),
    fetchOrders(shopDomain, accessToken),
  ]);

  if (products.length > 0) {
    await upsertProducts(
      admin,
      products.map((product) => ({
        tenant_id: tenantId,
        shopify_id: product.id,
        title: product.title,
        description: product.description,
        image_url: product.featuredImage?.url ?? null,
      }))
    );
  }

  const productIds = products.map((product) => product.id);
  let productMap = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: savedProducts, error } = await admin
      .from("product")
      .select("id,shopify_id")
      .eq("tenant_id", tenantId)
      .in("shopify_id", productIds);
    assertNoError(error, "Failed to fetch saved product rows");
    productMap = new Map((savedProducts ?? []).map((p) => [p.shopify_id, p.id]));
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

  if (variantRows.length > 0) {
    const { error } = await admin.from("product_variant").upsert(variantRows, {
      onConflict: "tenant_id,shopify_id",
    });
    assertNoError(error, "Failed to upsert product_variant");
  }

  const variantShopifyIds = variantRows.map((variant) => variant.shopify_id);
  let variantMap = new Map<string, string>();
  if (variantShopifyIds.length > 0) {
    const { data: savedVariants, error } = await admin
      .from("product_variant")
      .select("id,shopify_id")
      .eq("tenant_id", tenantId)
      .in("shopify_id", variantShopifyIds);
    assertNoError(error, "Failed to fetch saved product_variant rows");
    variantMap = new Map((savedVariants ?? []).map((v) => [v.shopify_id, v.id]));
  }

  const orderRows = orders.map((order) => ({
    tenant_id: tenantId,
    shopify_order_id: order.id,
    order_number: order.name,
    status: mapOrderStatus(order),
  }));
  if (orderRows.length > 0) {
    const { error } = await admin.from("orders").upsert(orderRows, {
      onConflict: "tenant_id,shopify_order_id",
    });
    assertNoError(error, "Failed to upsert orders");
  }

  const orderIds = orderRows.map((order) => order.shopify_order_id);
  let orderMap = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: savedOrders, error } = await admin
      .from("orders")
      .select("id,shopify_order_id")
      .eq("tenant_id", tenantId)
      .in("shopify_order_id", orderIds);
    assertNoError(error, "Failed to fetch saved orders rows");
    orderMap = new Map((savedOrders ?? []).map((o) => [o.shopify_order_id, o.id]));
  }

  const orderLineRows = orders.flatMap((order) => {
    const orderId = orderMap.get(order.id);
    if (!orderId) return [];

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
    }));
  });

  if (orderLineRows.length > 0) {
    const { error } = await admin.from("order_line").upsert(orderLineRows, {
      onConflict: "tenant_id,order_id,variant_id",
    });
    assertNoError(error, "Failed to upsert order_line");
  }

  const fulfilledOrderIds: string[] = [];
  const partialOrders: string[] = [];
  for (const order of orders) {
    const localId = orderMap.get(order.id);
    if (!localId) continue;
    const status = (order.displayFulfillmentStatus ?? "").toUpperCase();
    if (status === "FULFILLED") fulfilledOrderIds.push(localId);
    else if (status === "PARTIALLY_FULFILLED") partialOrders.push(localId);
  }

  if (fulfilledOrderIds.length > 0) {
    const nowIso = new Date().toISOString();
    await admin
      .from("order_line")
      .update({ shipped_at: nowIso })
      .eq("tenant_id", tenantId)
      .in("order_id", fulfilledOrderIds)
      .is("shipped_at", null);
  }

  if (partialOrders.length > 0) {
    console.warn(
      "[shopify-sync] partial fulfillment encountered for orders; per-line mark-shipped deferred to v2",
      partialOrders
    );
  }

  let allocationRuns = 0;
  const orderLocalIds = Array.from(new Set(orderLineRows.map((row) => row.order_id)));
  for (const localOrderId of orderLocalIds) {
    try {
      await reconcileOrderAllocations(admin, tenantId, localOrderId);
      allocationRuns += 1;
    } catch {
      continue;
    }
  }

  // Batch-fetch all order line IDs for this sync in one query
  const { data: allPlanLines } = await admin
    .from("order_line")
    .select("id, order_id")
    .eq("tenant_id", tenantId)
    .in("order_id", orderLocalIds);

  // Group by order_id in memory
  const linesByOrderId = new Map<string, string[]>();
  for (const row of allPlanLines ?? []) {
    const list = linesByOrderId.get(row.order_id) ?? [];
    list.push(row.id);
    linesByOrderId.set(row.order_id, list);
  }

  // Run financial planning with zero extra DB reads
  let planRuns = 0;
  let planErrors = 0;
  const weekStart = getWeekStart();
  for (const localOrderId of orderLocalIds) {
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

  const { error: activityError } = await admin.from("activity_log").insert({
    tenant_id: tenantId,
    actor_id: null,
    event: "SHOPIFY_SYNC_COMPLETED",
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
  assertNoError(activityError, "Failed to insert activity_log");

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
