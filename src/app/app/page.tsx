import styles from "./dashboard.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findInventoryInvariantIssues } from "@/lib/inventory/invariants";
import { OrderTrendChart, TopProductsChart } from "./dashboard-charts";
import StatusBadge from "./_ui/status-badge";
import EmptyState from "./_ui/empty-state";

type OrderRow = {
  id: string;
  shopify_order_id: string | null;
  order_number: string | null;
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
      Number(row.on_hand ?? 0) *
        Number(firstOf(row.component)?.cost_per_unit ?? 0),
    0
  );

  const totalInProd = (balances ?? []).reduce(
    (sum, row) =>
      sum +
      Number(row.in_prod ?? 0) *
        Number(firstOf(row.component)?.cost_per_unit ?? 0),
    0
  );

  const totalReservedValue = (balances ?? []).reduce(
    (sum, row) =>
      sum +
      Number(row.reserved ?? 0) *
        Number(firstOf(row.component)?.cost_per_unit ?? 0),
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
    .select("id,shopify_order_id,order_number,status,created_at")
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

  const activeVariantIds = new Set(
    (activeBomRows ?? []).filter(Boolean).map((bom) => bom.variant_id)
  );
  const missingBomCount = (variantRows ?? []).filter(
    (variant) => !activeVariantIds.has(variant.id)
  ).length;
  const totalVariantCount = (variantRows ?? []).length;
  const bomCoverage =
    totalVariantCount > 0
      ? Math.round((variantsWithBomCount / totalVariantCount) * 100)
      : 0;

  const ordersList = (orders ?? []) as OrderRow[];
  const totalFulfilled = timelineBuckets.reduce(
    (sum, bucket) => sum + bucket.fulfilled,
    0
  );
  const totalPlaced = timelineBuckets.reduce(
    (sum, bucket) => sum + bucket.placed,
    0
  );
  const fulfillmentRate =
    totalPlaced > 0 ? Math.round((totalFulfilled / totalPlaced) * 100) : 0;

  const riskCount = lowStockCount + missingBomCount + invariantIssues.length;
  const riskTone =
    riskCount === 0 ? "success" : riskCount > 6 ? "danger" : "warning";
  const topAlert =
    lowStockCount > 0
      ? `${lowStockCount} component${lowStockCount === 1 ? "" : "s"} below reorder point`
      : openOrdersCount && openOrdersCount > 0
      ? `${openOrdersCount} open order${openOrdersCount === 1 ? "" : "s"} waiting to clear`
      : "Inventory and order flow are stable";

  const orderMetrics = [
    {
      label: "Low stock components",
      value: lowStockCount.toLocaleString(),
      detail: `${componentCount.toLocaleString()} components tracked`,
    },
    {
      label: "Open orders",
      value: (openOrdersCount ?? 0).toLocaleString(),
      detail: `${ordersList.length.toLocaleString()} recent order${ordersList.length === 1 ? "" : "s"} synced`,
    },
    {
      label: "Fulfillment rate",
      value: `${fulfillmentRate}%`,
      detail: "Placed vs fulfilled over the last 6 months",
    },
  ];

  const financeMetrics = [
    {
      label: "On hand value",
      value: formatCurrency(totalOnHand),
      detail: "Current inventory held in stock",
    },
    {
      label: "In production",
      value: formatCurrency(totalInProd),
      detail: "Value tied up in active work",
    },
    {
      label: "Reserved value",
      value: formatCurrency(totalReservedValue),
      detail: "Inventory already committed to orders",
    },
  ];

  const planningTone =
    invariantIssues.length > 0
      ? "danger"
      : missingBomCount > 0
      ? "warning"
      : "success";

  return (
    <div className={styles.dashboard}>
      <section className={styles.utilityBar} aria-label="Dashboard actions">
        <div className={styles.utilityActions}>
          <a href="/app/orders" className={styles.secondaryAction}>
            Open orders
          </a>
          <a href="/app/inventory" className={styles.primaryAction}>
            Review inventory
          </a>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>Orders & Stock</p>
          <h2 className={styles.sectionTitle}>Live demand and inventory pressure</h2>
          <p className={styles.sectionBody}>
            Keep the queue, low-stock exposure, and recent demand pattern together.
          </p>
        </div>

        <div className={styles.hero}>
          <div className={styles.heroMain}>
            <div className={styles.heroCopy}>
              <p className={styles.heroEyebrow}>Current load</p>
              <div className={styles.heroTitleRow}>
                <h3>
                  {openOrdersCount && openOrdersCount > 0
                    ? `${openOrdersCount} open order${openOrdersCount === 1 ? "" : "s"} in flight`
                    : "Order queue is clear"}
                </h3>
                <StatusBadge variant={riskTone}>
                  {riskCount === 0 ? "Stable" : `${riskCount} risks`}
                </StatusBadge>
              </div>
              <p className={styles.heroBody}>{topAlert}</p>
            </div>

            <div className={styles.metricGrid}>
              {orderMetrics.map((metric) => (
                <div key={metric.label} className={styles.metricCard}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <p>{metric.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.heroAside}>
            <div className={styles.alertList}>
              <div className={styles.alertItem}>
                <StatusBadge variant={lowStockCount > 0 ? "warning" : "success"}>
                  {lowStockCount > 0 ? "Stock risk" : "Stock healthy"}
                </StatusBadge>
                <p>
                  {lowStockCount} component{lowStockCount === 1 ? "" : "s"} below reorder point
                </p>
              </div>
              <div className={styles.alertItem}>
                <StatusBadge
                  variant={openOrdersCount && openOrdersCount > 0 ? "info" : "success"}
                >
                  {openOrdersCount && openOrdersCount > 0 ? "Open queue" : "Queue clear"}
                </StatusBadge>
                <p>
                  {openOrdersCount ?? 0} order{openOrdersCount === 1 ? "" : "s"} still active
                </p>
              </div>
              <div className={styles.alertItem}>
                <StatusBadge variant="info">Demand mix</StatusBadge>
                <p>
                  {topProducts.length} product{topProducts.length === 1 ? "" : "s"} drove demand this month
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.contentGrid}>
          <div className={styles.leftColumn}>
            <div className={styles.chartsRow}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Demand mix</p>
                    <h3>Top products this month</h3>
                  </div>
                </div>
                <div className={styles.chart}>
                  <TopProductsChart data={topProducts} />
                </div>
                {topProducts.length === 0 ? (
                  <EmptyState
                    title="No recent order demand"
                    message="Once Shopify orders are synced, the highest-demand products for the last 30 days will show here."
                  />
                ) : (
                  <div className={styles.legend}>
                    {topProducts.map((entry, index) => {
                      const colorClass = [
                        styles.legendGreen,
                        styles.legendYellow,
                        styles.legendBlue,
                        styles.legendPurple,
                        styles.legendPink,
                      ][index % 5];
                      return (
                        <div key={entry.title} className={styles.legendItem}>
                          <span className={`${styles.legendDot} ${colorClass}`}>
                            {entry.title}
                          </span>
                          <span className={styles.legendValue}>{entry.count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Fulfillment flow</p>
                    <h3>Order trend</h3>
                  </div>
                </div>
                <div className={styles.chartSummary}>
                  <p className={styles.kpiLarge}>{fulfillmentRate}%</p>
                  <p className={styles.kpiLabel}>Fulfilled over the last 6 months</p>
                </div>
                <div className={styles.chart}>
                  <OrderTrendChart data={timelineBuckets} />
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Live queue</p>
                  <h3>Recent orders</h3>
                </div>
                <a href="/app/orders">View all</a>
              </div>
              {ordersList.length === 0 ? (
                <EmptyState
                  title="No recent orders"
                  message="Sync Shopify orders to populate the live order queue and monitor allocation progress."
                />
              ) : (
                <div className={styles.orderList}>
                  {ordersList.map((order) => {
                    const status = order.status?.toLowerCase();
                    const pillVariant =
                      status === "fulfilled"
                        ? "success"
                        : status === "cancelled"
                        ? "danger"
                        : "info";

                    return (
                      <a
                        key={order.id}
                        href={`/app/orders/${order.id}`}
                        className={styles.orderRow}
                      >
                        <div>
                          <strong>
                            #{order.order_number ?? order.shopify_order_id ?? order.id.slice(0, 6)}
                          </strong>
                          <p>{new Date(order.created_at).toLocaleDateString("en-GB")}</p>
                        </div>
                        <StatusBadge variant={pillVariant}>{order.status}</StatusBadge>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className={styles.rightColumn}>
            <div className={styles.card}>
              <div>
                <p className={styles.sectionEyebrow}>Recent flow</p>
                <h3>Latest order updates</h3>
              </div>
              <div className={styles.activityList}>
                {ordersList.slice(0, 3).map((order) => (
                  <div key={order.id} className={styles.activityItem}>
                    <span className={styles.activityDot} />
                    <span>
                      Order #{order.order_number ?? order.shopify_order_id ?? order.id.slice(0, 6)} - {order.status}
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
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>Finance</p>
          <h2 className={styles.sectionTitle}>Inventory value and committed capital</h2>
          <p className={styles.sectionBody}>
            Keep the money view separate from queue and planning signals.
          </p>
        </div>

        <div className={styles.financeGrid}>
          {financeMetrics.map((metric) => (
            <div key={metric.label} className={styles.metricCard}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </div>
          ))}

          <div className={styles.card}>
            <div>
              <p className={styles.sectionEyebrow}>Current position</p>
              <h3>Inventory snapshot</h3>
            </div>
            <div className={styles.notificationList}>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifGreen}`} />
                <span>On hand: {formatCurrency(totalOnHand)}</span>
              </div>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifBlue}`} />
                <span>In production: {formatCurrency(totalInProd)}</span>
              </div>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifYellow}`} />
                <span>Reserved: {formatCurrency(totalReservedValue)}</span>
              </div>
              <div className={styles.notificationItem}>
                <span className={`${styles.notifDot} ${styles.notifGreen}`} />
                <span>{lowStockCount} low stock alert{lowStockCount === 1 ? "" : "s"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>Planning Capabilities</p>
          <h2 className={styles.sectionTitle}>BOM coverage, integrity, and next actions</h2>
          <p className={styles.sectionBody}>
            Keep readiness and planning work together instead of mixing them into the operating view.
          </p>
        </div>

        <div className={styles.planningGrid}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Readiness</p>
                <h3>Planning health</h3>
              </div>
              <StatusBadge variant={planningTone}>
                {missingBomCount > 0 || invariantIssues.length > 0
                  ? "Attention needed"
                  : "Ready"}
              </StatusBadge>
            </div>
            <div className={styles.metricGrid}>
              <div className={styles.metricCard}>
                <span>Active BOMs</span>
                <strong>{variantsWithBomCount.toLocaleString()}</strong>
                <p>Variant BOMs currently available for planning</p>
              </div>
              <div className={styles.metricCard}>
                <span>BOM coverage</span>
                <strong>{bomCoverage}%</strong>
                <p>
                  {variantsWithBomCount.toLocaleString()} of {totalVariantCount.toLocaleString()} variants covered
                </p>
              </div>
              <div className={styles.metricCard}>
                <span>Integrity issues</span>
                <strong>{invariantIssues.length.toLocaleString()}</strong>
                <p>Inventory balance anomalies still needing review</p>
              </div>
            </div>
          </div>

          <div className={styles.rightColumn}>
            <div className={styles.card}>
              <div>
                <p className={styles.sectionEyebrow}>Triage</p>
                <h3>Priority alerts</h3>
              </div>
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

            <div className={styles.quickActions}>
              <div>
                <p className={styles.sectionEyebrow}>Next actions</p>
                <h3>Jump into the work</h3>
              </div>
              <div className={styles.actionGrid}>
                <a href="/app/products" className={styles.actionCard}>
                  <span className={styles.actionIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                  </span>
                  <p>Build BOMs</p>
                  <span>Create or revise BOMs for high-demand variants.</span>
                </a>
                <a href="/app/components" className={styles.actionCard}>
                  <span className={styles.actionIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
                  </span>
                  <p>Review components</p>
                  <span>Check reorder points and investigate stock exposure.</span>
                </a>
                <a href="/app/stocktake" className={styles.actionCard}>
                  <span className={styles.actionIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 18H3"/><path d="m15 18 2 2 4-4"/><path d="M16 12H3"/><path d="M16 6H3"/></svg>
                  </span>
                  <p>Run stocktake</p>
                  <span>Start a count to reconcile inventory with real stock.</span>
                </a>
                <a href="/app/settings" className={styles.actionCard}>
                  <span className={styles.actionIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                  </span>
                  <p>Open settings</p>
                  <span>Check Shopify sync health and workspace configuration.</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
