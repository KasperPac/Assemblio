import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphqlRequest } from "./client";
import { reconcileOrderAllocations } from "@/lib/allocation/reconcile-order";

type SyncResult = {
  products: number;
  variants: number;
  orders: number;
  orderLines: number;
  allocations: number;
};

type ShopifyProductNode = {
  id: string;
  title: string;
  description: string;
  featuredImage: { url: string | null } | null;
  variants: { nodes: Array<{ id: string; title: string | null; sku: string | null }> };
};

type ShopifyOrderNode = {
  id: string;
  cancelledAt: string | null;
  displayFulfillmentStatus: string | null;
  lineItems: { nodes: Array<{ quantity: number; variant: { id: string } | null }> };
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

function mapOrderStatus(order: ShopifyOrderNode) {
  if (order.cancelledAt) return "cancelled";
  if ((order.displayFulfillmentStatus ?? "").toLowerCase().includes("fulfilled")) {
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
            nodes { id title sku }
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
          cancelledAt
          displayFulfillmentStatus
          lineItems(first: 100) {
            nodes {
              quantity
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
    await admin.from("shopify_product").upsert(
      products.map((product) => ({
        tenant_id: tenantId,
        shopify_id: product.id,
        title: product.title,
        description: product.description,
        image_url: product.featuredImage?.url ?? null,
      })),
      { onConflict: "tenant_id,shopify_id" }
    );
  }

  const productIds = products.map((product) => product.id);
  let productMap = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: savedProducts } = await admin
      .from("shopify_product")
      .select("id,shopify_id")
      .eq("tenant_id", tenantId)
      .in("shopify_id", productIds);
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
      }))
      .filter((variant) => variant.product_id)
  );

  if (variantRows.length > 0) {
    await admin.from("shopify_variant").upsert(variantRows, {
      onConflict: "tenant_id,shopify_id",
    });
  }

  const variantShopifyIds = variantRows.map((variant) => variant.shopify_id);
  let variantMap = new Map<string, string>();
  if (variantShopifyIds.length > 0) {
    const { data: savedVariants } = await admin
      .from("shopify_variant")
      .select("id,shopify_id")
      .eq("tenant_id", tenantId)
      .in("shopify_id", variantShopifyIds);
    variantMap = new Map((savedVariants ?? []).map((v) => [v.shopify_id, v.id]));
  }

  const orderRows = orders.map((order) => ({
    tenant_id: tenantId,
    shopify_order_id: order.id,
    status: mapOrderStatus(order),
  }));
  if (orderRows.length > 0) {
    await admin.from("orders").upsert(orderRows, {
      onConflict: "tenant_id,shopify_order_id",
    });
  }

  const orderIds = orderRows.map((order) => order.shopify_order_id);
  let orderMap = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: savedOrders } = await admin
      .from("orders")
      .select("id,shopify_order_id")
      .eq("tenant_id", tenantId)
      .in("shopify_order_id", orderIds);
    orderMap = new Map((savedOrders ?? []).map((o) => [o.shopify_order_id, o.id]));
  }

  const orderLineRows = orders.flatMap((order) => {
    const orderId = orderMap.get(order.id);
    if (!orderId) return [];

    const quantityByVariant = new Map<string, number>();
    for (const lineItem of order.lineItems.nodes) {
      const variantId = lineItem.variant?.id;
      const localVariantId = variantId ? variantMap.get(variantId) : undefined;
      if (!localVariantId) continue;
      quantityByVariant.set(
        localVariantId,
        (quantityByVariant.get(localVariantId) ?? 0) + lineItem.quantity
      );
    }

    return Array.from(quantityByVariant.entries()).map(([variantId, quantity]) => ({
      tenant_id: tenantId,
      order_id: orderId,
      variant_id: variantId,
      quantity,
    }));
  });

  if (orderLineRows.length > 0) {
    await admin.from("order_line").upsert(orderLineRows, {
      onConflict: "tenant_id,order_id,variant_id",
    });
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

  await admin.from("activity_log").insert({
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
    },
  });

  return {
    products: products.length,
    variants: variantRows.length,
    orders: orderRows.length,
    orderLines: orderLineRows.length,
    allocations: allocationRuns,
  };
}
