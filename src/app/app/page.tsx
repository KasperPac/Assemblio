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
  const activeVariantIds = new Set((activeBomRows ?? []).map((b) => b.variant_id));
  const missingBomCount = (variantRows ?? []).filter(
    (variant) => !activeVariantIds.has(variant.id)
  ).length;

  const ordersList = (orders ?? []) as OrderRow[];

  return (
    <div className={styles.dashboard}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Dashboard</h1>
          <p>Quick overview of what matters today</p>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.icon} />
          <div>
            <p className={styles.statValue}>{componentCount}</p>
            <p className={styles.statLabel}>Total Components</p>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.icon} />
          <div>
            <p className={styles.statValue}>{variantsWithBomCount}</p>
            <p className={styles.statLabel}>Variants with BOM</p>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.icon} />
          <div>
            <p className={styles.statValue}>{openOrdersCount ?? 0}</p>
            <p className={styles.statLabel}>Open Orders</p>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.icon} />
          <div>
            <p className={styles.statValue}>{lowStockCount}</p>
            <p className={styles.statLabel}>Low Stock Components</p>
          </div>
        </div>
      </div>

      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.icon} />
          <div>
            <p className={styles.kpiValue}>{formatCurrency(totalOnHand)}</p>
            <p className={styles.kpiLabel}>Value of Stock on Hand</p>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.icon} />
          <div>
            <p className={styles.kpiValue}>{formatCurrency(totalInProd)}</p>
            <p className={styles.kpiLabel}>Value of Stock in Production</p>
          </div>
        </div>
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>Placed vs Fulfilled Orders</h3>
            <div className={styles.legend}>
              <span className={styles.dotBlue}>Placed Orders</span>
              <span className={styles.dotTeal}>Fulfilled Orders</span>
              <span className={styles.dotPink}>Cancelled Orders</span>
            </div>
          </div>
          <div className={styles.chart}>
            <OrderTrendChart data={timelineBuckets} />
          </div>
        </div>
        <div className={styles.card}>
          <h3>Alerts</h3>
          <div className={styles.alertList}>
            <div>
              <span className={styles.alertIcon}>!</span>
              <div>
                <p>Low Stock Alert</p>
                <span>
                  {lowStockCount} component
                  {lowStockCount === 1 ? "" : "s"} below reorder point
                </span>
              </div>
            </div>
            <div>
              <span className={styles.alertIcon}>!</span>
              <div>
                <p>Missing BOM Alert</p>
                <span>
                  {missingBomCount ?? 0} variant
                  {(missingBomCount ?? 0) === 1 ? "" : "s"} missing active BOM
                </span>
              </div>
            </div>
            <div>
              <span className={styles.alertIcon}>!</span>
              <div>
                <p>Inventory Integrity Alert</p>
                <span>
                  {invariantIssues.length} invariant issue
                  {invariantIssues.length === 1 ? "" : "s"} detected
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.lowerGrid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>Recent Orders</h3>
            <a href="/app/orders">View All</a>
          </div>
          <div className={styles.table}>
            {ordersList.map((order) => {
              const status = order.status?.toLowerCase();
              const pill =
                status === "fulfilled"
                  ? styles.statusGreen
                  : status === "allocated"
                  ? styles.statusBlue
                  : styles.statusBlue;
              return (
                <div key={order.id} className={styles.tableRow}>
                  <span>#{order.shopify_order_id ?? order.id.slice(0, 4)}</span>
                  <span>
                    {new Date(order.created_at).toLocaleDateString("en-GB")}
                  </span>
                  <span className={pill}>{order.status}</span>
                  <span className={styles.statusOk}>OK</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>Top 5 Products last 30 days</h3>
          </div>
          <div className={styles.pie}>
            <TopProductsChart data={topProducts} />
            <div className={styles.pieLegend}>
              {topProducts.length === 0
                ? <span>No order lines in last 30 days</span>
                : topProducts.map((entry) => (
                    <span key={entry.title}>
                      {entry.title} ({entry.count})
                    </span>
                  ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.quickActions}>
        <h3>Quick Actions</h3>
        <div className={styles.actionGrid}>
          <div>
            <span className={styles.actionIcon} />
            <p>Build BOMs</p>
            <span>Create and manage product BOMs</span>
          </div>
          <div>
            <span className={styles.actionIcon} />
            <p>View Components</p>
            <span>Browse and manage components</span>
          </div>
          <div>
            <span className={styles.actionIcon} />
            <p>Run Stocktake</p>
            <span>Start a new stocktake session</span>
          </div>
          <div>
            <span className={styles.actionIcon} />
            <p>Go to Settings</p>
            <span>Configure app settings</span>
          </div>
        </div>
      </div>
    </div>
  );
}
