import styles from "./dashboard.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findInventoryInvariantIssues } from "@/lib/inventory/invariants";
import { OrderTrendChart, TopProductsChart } from "./dashboard-charts";

type OrderRow = {
  id: string;
  shopify_order_id: string | null;
  status: string;
  created_at: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const [{ count: componentCount }, { count: variantsWithBomCount }] =
    await Promise.all([
      supabase.from("component").select("*", { count: "exact", head: true }),
      supabase
        .from("product_bom")
        .select("variant_id", { count: "exact", head: true })
        .eq("is_active", true),
    ]).then((results) =>
      results.map((result) => ({ count: result.count ?? 0 }))
    );

  const { count: openOrdersCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .neq("status", "fulfilled");

  const { data: lowStockRows } = await supabase
    .from("inventory_balance")
    .select("on_hand,component:component_id(reorder_point)");

  const lowStockCount =
    lowStockRows?.filter(
      (row) =>
        Number(row.on_hand ?? 0) <
        Number(firstOf(row.component)?.reorder_point ?? 0)
    ).length ?? 0;

  const { data: balances } = await supabase
    .from("inventory_balance")
    .select(
      "component_id,location_id,on_hand,in_prod,reserved,component:component_id(name,cost_per_unit),location:location_id(name)"
    );

  const totalOnHand = (balances ?? []).reduce(
    (sum, row) =>
      sum +
      Number(row.on_hand ?? 0) * Number(firstOf(row.component)?.cost_per_unit ?? 0),
    0
  );
  const totalInProd = (balances ?? []).reduce(
    (sum, row) =>
      sum +
      Number(row.in_prod ?? 0) * Number(firstOf(row.component)?.cost_per_unit ?? 0),
    0
  );
  const invariantIssues = findInventoryInvariantIssues(
    (balances ?? []).map((row) => ({
      componentName: firstOf(row.component)?.name ?? "Unknown component",
      locationName: firstOf(row.location)?.name ?? "Unknown location",
      onHand: Number(row.on_hand ?? 0),
      inProd: Number(row.in_prod ?? 0),
      reserved: Number(row.reserved ?? 0),
    }))
  );

  const { data: orders } = await supabase
    .from("orders")
    .select("id,shopify_order_id,status,created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const now = new Date();
  const start = new Date();
  start.setMonth(now.getMonth() - 5);
  const { data: orderTimeline } = await supabase
    .from("orders")
    .select("status,created_at")
    .gte("created_at", start.toISOString());

  const timelineBuckets = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      label: date.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      placed: 0,
      fulfilled: 0,
      cancelled: 0,
    };
  });

  (orderTimeline ?? []).forEach((row) => {
    const created = new Date(row.created_at);
    const bucketIndex =
      (created.getFullYear() - start.getFullYear()) * 12 +
      created.getMonth() -
      start.getMonth();
    if (bucketIndex >= 0 && bucketIndex < timelineBuckets.length) {
      const bucket = timelineBuckets[bucketIndex];
      bucket.placed += 1;
      if (row.status === "fulfilled") bucket.fulfilled += 1;
      if (row.status === "cancelled") bucket.cancelled += 1;
    }
  });

  const { data: orderLines } = await supabase
    .from("order_line")
    .select("created_at,variant:variant_id(product:product_id(title))")
    .gte(
      "created_at",
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    );

  const productCounts = (orderLines ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      const variant = firstOf(row.variant);
      const product = firstOf(variant?.product);
      const title = product?.title ?? "Unknown";
      acc[title] = (acc[title] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({ title, count }));

  const [{ data: variantRows }, { data: activeBomRows }] = await Promise.all([
    supabase.from("shopify_variant").select("id"),
    supabase.from("product_bom").select("variant_id").eq("is_active", true),
  ]);
  const activeVariantIds = new Set((activeBomRows ?? []).filter(Boolean).map((b) => b.variant_id));
  const missingBomCount = (variantRows ?? []).filter(
    (variant) => !activeVariantIds.has(variant.id)
  ).length;

  const ordersList = (orders ?? []) as OrderRow[];

  const totalFulfilled = timelineBuckets.reduce((s, b) => s + b.fulfilled, 0);
  const totalPlaced = timelineBuckets.reduce((s, b) => s + b.placed, 0);
  const fulfillmentRate = totalPlaced > 0 ? Math.round((totalFulfilled / totalPlaced) * 100) : 0;

  return (
    <div className={styles.dashboard}>
      {/* ── Top Stats Row ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Total Components</p>
          <p className={styles.statValue}>{componentCount.toLocaleString()}</p>
          <p className={styles.statChange}>
            <span className={styles.statChangeIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
            </span>
            Active inventory
          </p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Stock on Hand Value</p>
          <p className={styles.statValue}>{formatCurrency(totalOnHand)}</p>
          <p className={styles.statChange}>
            <span className={styles.statChangeIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
            </span>
            Current valuation
          </p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Fulfillment Rate</p>
          <p className={styles.statValue}>{fulfillmentRate}%</p>
          <p className={styles.statChange}>
            <span className={styles.statChangeIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
            </span>
            Last 6 months
          </p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Open Orders</p>
          <p className={styles.statValue}>{(openOrdersCount ?? 0).toLocaleString()}</p>
          <p className={styles.statChange}>
            <span className={styles.statChangeIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
            </span>
            Awaiting fulfillment
          </p>
        </div>
      </div>

      {/* ── Main Grid: left + right panels ── */}
      <div className={styles.contentGrid}>
        <div className={styles.leftColumn}>
          {/* ── Charts Row ── */}
          <div className={styles.chartsRow}>
            {/* Sales Summary / Top Products Donut */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>Product Breakdown</h3>
                <button className={styles.moreBtn} type="button">&#8942;</button>
              </div>
              <div className={styles.chart}>
                <TopProductsChart data={topProducts} />
              </div>
              <div className={styles.legend}>
                {topProducts.length === 0 ? (
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.legendGreen}`}>No order data</span>
                  </div>
                ) : (
                  topProducts.map((entry, i) => {
                    const colorClass = [styles.legendGreen, styles.legendYellow, styles.legendBlue, styles.legendPurple, styles.legendPink][i % 5];
                    return (
                      <div key={entry.title} className={styles.legendItem}>
                        <span className={`${styles.legendDot} ${colorClass}`}>{entry.title}</span>
                        <span className={styles.legendValue}>{entry.count}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Performance Growth / Order Trend */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>Performance Growth</h3>
              </div>
              <div>
                <p className={styles.kpiLarge}>{formatCurrency(totalInProd)}</p>
                <p className={styles.kpiLabel}>Stock in Production</p>
              </div>
              <div className={styles.chart}>
                <OrderTrendChart data={timelineBuckets} />
              </div>
            </div>
          </div>

          {/* ── Orders Table ── */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>Recent Orders</h3>
              <a href="/app/orders">View All</a>
            </div>
            <div className={styles.tableSection}>
              <div className={styles.tableHeader}>
                <span>Order</span>
                <span>Date</span>
                <span>Status</span>
                <span>Integrity</span>
              </div>
              {ordersList.map((order) => {
                const status = order.status?.toLowerCase();
                const pill =
                  status === "fulfilled"
                    ? styles.statusGreen
                    : status === "cancelled"
                    ? styles.statusRed
                    : styles.statusBlue;
                return (
                  <div key={order.id} className={styles.tableRow}>
                    <span>#{order.shopify_order_id ?? order.id.slice(0, 6)}</span>
                    <span>{new Date(order.created_at).toLocaleDateString("en-GB")}</span>
                    <span><span className={pill}>{order.status}</span></span>
                    <span><span className={styles.statusGreen}>OK</span></span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Quick Actions ── */}
          <div className={styles.quickActions}>
            <h3>Quick Actions</h3>
            <div className={styles.actionGrid}>
              <a href="/app/products" className={styles.actionCard}>
                <span className={styles.actionIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                </span>
                <p>Build BOMs</p>
                <span>Create and manage product BOMs</span>
              </a>
              <a href="/app/components" className={styles.actionCard}>
                <span className={styles.actionIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
                </span>
                <p>View Components</p>
                <span>Browse and manage components</span>
              </a>
              <a href="/app/stocktake" className={styles.actionCard}>
                <span className={styles.actionIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 18H3"/><path d="m15 18 2 2 4-4"/><path d="M16 12H3"/><path d="M16 6H3"/></svg>
                </span>
                <p>Run Stocktake</p>
                <span>Start a new stocktake session</span>
              </a>
              <a href="/app/settings" className={styles.actionCard}>
                <span className={styles.actionIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                </span>
                <p>Go to Settings</p>
                <span>Configure app settings</span>
              </a>
            </div>
          </div>
        </div>

        {/* ── Right Side Panels ── */}
        <div className={styles.rightColumn}>
          {/* Notifications / Alerts */}
          <div className={styles.card}>
            <h3>Notifications</h3>
            <div className={styles.notificationList}>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifYellow}`} />
                <span>{lowStockCount} component{lowStockCount === 1 ? "" : "s"} below reorder point</span>
              </div>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifRed}`} />
                <span>{missingBomCount} variant{missingBomCount === 1 ? "" : "s"} missing active BOM</span>
              </div>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifBlue}`} />
                <span>{invariantIssues.length} inventory integrity issue{invariantIssues.length === 1 ? "" : "s"}</span>
              </div>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifGreen}`} />
                <span>{variantsWithBomCount} active BOMs configured</span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className={styles.card}>
            <h3>Recent Activity</h3>
            <div className={styles.activityList}>
              {ordersList.slice(0, 3).map((order) => (
                <div key={order.id} className={styles.activityItem}>
                  <span className={styles.activityDot} />
                  <span>
                    Order #{order.shopify_order_id ?? order.id.slice(0, 6)} — {order.status}
                  </span>
                </div>
              ))}
              {ordersList.length === 0 && (
                <div className={styles.activityItem}>
                  <span className={styles.activityDot} />
                  <span>No recent orders</span>
                </div>
              )}
            </div>
          </div>

          {/* Inventory Summary */}
          <div className={styles.card}>
            <h3>Inventory Summary</h3>
            <div className={styles.notificationList}>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifGreen}`} />
                <span>On Hand: {formatCurrency(totalOnHand)}</span>
              </div>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifBlue}`} />
                <span>In Production: {formatCurrency(totalInProd)}</span>
              </div>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifYellow}`} />
                <span>{lowStockCount} low stock alert{lowStockCount === 1 ? "" : "s"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
