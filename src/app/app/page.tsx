import styles from "./dashboard.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import Link from "next/link";
import StatusBadge from "./_ui/status-badge";
import { calcDaysRemaining } from "@/lib/dashboard/calculations";
import { FinanceChartCard } from "./_dashboard/finance-chart";
import { OrdersChartCard } from "./_dashboard/orders-chart";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

function getWeekBounds(weeksAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek - weeksAgo * 7);
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return { start: monday, end: nextMonday };
}

export default async function DashboardPage() {
  const context = await getServerTenantContext();
  if (!context) {
    return (
      <div className={styles.dashboard}>
        <p className={styles.emptyMsg}>Could not resolve the active tenant.</p>
      </div>
    );
  }

  const { supabase, tenantId } = context;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const thisWeek = getWeekBounds(0);
  const lastWeek = getWeekBounds(1);

  const [
    { count: productCount },
    { count: componentCount },
    { count: supplierCount },
    { count: openOrderCount },
    { data: balances },
    { data: components },
    { data: bomUsage },
    { data: recentFulfilled },
    { data: sixMonthOrders },
    { count: thisWeekCount },
    { count: lastWeekCount },
    { data: openOrders },
  ] = await Promise.all([
    supabase.from("product").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("component").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("supplier").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "fulfilled"),
    supabase.from("inventory_balance").select("component_id,on_hand,in_prod,reserved,component:component_id(cost_per_unit)").eq("tenant_id", tenantId),
    supabase.from("component").select("id,name,reorder_point").eq("tenant_id", tenantId),
    supabase.from("bom_component").select("component_id,quantity").eq("tenant_id", tenantId),
    supabase.from("orders").select("id").eq("tenant_id", tenantId).eq("status", "fulfilled").gte("updated_at", thirtyDaysAgo),
    supabase.from("orders").select("status").eq("tenant_id", tenantId).gte("created_at", sixMonthsAgo.toISOString()),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "fulfilled").gte("updated_at", thisWeek.start.toISOString()).lt("updated_at", thisWeek.end.toISOString()),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "fulfilled").gte("updated_at", lastWeek.start.toISOString()).lt("updated_at", lastWeek.end.toISOString()),
    supabase.from("orders").select("id,shopify_order_id,order_number,status,created_at").eq("tenant_id", tenantId).neq("status", "fulfilled").order("created_at", { ascending: false }).limit(8),
  ]);

  // Inventory on-hand value
  const balRows = balances ?? [];
  const onHandValue = balRows.reduce((sum, r) => {
    return sum + Number(r.on_hand ?? 0) * Number(firstOf(r.component)?.cost_per_unit ?? 0);
  }, 0);

  // On-time fulfillment rate (6-month window)
  const allOrders = sixMonthOrders ?? [];
  const placed = allOrders.length;
  const fulfillCount = allOrders.filter((r) => r.status === "fulfilled").length;
  const fulfillRate = placed > 0 ? Math.round((fulfillCount / placed) * 100) : 0;

  // Production throughput (this week vs last)
  const currentWeek = thisWeekCount ?? 0;
  const priorWeek = lastWeekCount ?? 0;
  const diff = currentWeek - priorWeek;
  const throughputLabel =
    diff > 0 ? `↑ ${diff} vs last week` :
    diff < 0 ? `↓ ${Math.abs(diff)} vs last week` :
    "No change from last week";
  const throughputClass = diff > 0 ? styles.trendUp : diff < 0 ? styles.trendDown : styles.trendNeutral;

  // Low stock alerts
  const fulfilledCount = (recentFulfilled ?? []).length;
  const burnByComponent = new Map<string, number>();
  (bomUsage ?? []).forEach((bc) => {
    const prev = burnByComponent.get(bc.component_id) ?? 0;
    burnByComponent.set(bc.component_id, prev + (Number(bc.quantity ?? 0) * fulfilledCount) / 30);
  });
  const reorderMap = new Map((components ?? []).map((c) => [c.id, Number(c.reorder_point ?? 0)]));
  const nameMap = new Map((components ?? []).map((c) => [c.id, c.name ?? "Unknown"]));

  const atRisk = balRows
    .map((b) => {
      const onHand = Number(b.on_hand ?? 0);
      const reserved = Number(b.reserved ?? 0);
      const days = calcDaysRemaining(onHand, reserved, burnByComponent.get(b.component_id) ?? 0);
      return {
        id: b.component_id,
        name: nameMap.get(b.component_id) ?? "Unknown",
        available: onHand - reserved,
        reorderPoint: reorderMap.get(b.component_id) ?? 0,
        days,
      };
    })
    .filter((b) => b.available <= b.reorderPoint)
    .slice(0, 8);

  return (
    <div className={styles.dashboard}>
      {/* Quick links bar */}
      <nav className={styles.quickLinks}>
        <Link href="/app/products" className={styles.quickLink}>
          <span className={styles.qlLabel}>Products</span>
          <span className={styles.qlCount}>{productCount ?? 0}</span>
        </Link>
        <Link href="/app/components" className={styles.quickLink}>
          <span className={styles.qlLabel}>Components</span>
          <span className={styles.qlCount}>{componentCount ?? 0}</span>
        </Link>
        <Link href="/app/suppliers" className={styles.quickLink}>
          <span className={styles.qlLabel}>Suppliers</span>
          <span className={styles.qlCount}>{supplierCount ?? 0}</span>
        </Link>
        <Link href="/app/orders" className={styles.quickLink}>
          <span className={styles.qlLabel}>Open orders</span>
          <span className={styles.qlCount}>{openOrderCount ?? 0}</span>
        </Link>
        {atRisk.length > 0 && (
          <Link href="/app/components" className={`${styles.quickLink} ${styles.quickLinkWarn}`}>
            <span className={styles.qlLabel}>Low stock</span>
            <span className={styles.qlCount}>{atRisk.length}</span>
          </Link>
        )}
      </nav>

      {/* KPI chips — full width */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Inventory value</span>
          <span className={styles.kpiValue}>{formatCurrency(onHandValue)}</span>
          <span className={styles.kpiSub}>On hand</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Fulfillment rate</span>
          <span className={`${styles.kpiValue} ${fulfillRate >= 90 ? styles.trendUp : fulfillRate >= 70 ? styles.trendNeutral : styles.trendDown}`}>
            {fulfillRate}%
          </span>
          <span className={styles.kpiSub}>6-month avg</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>This week</span>
          <span className={styles.kpiValue}>{currentWeek}</span>
          <span className={`${styles.kpiSub} ${throughputClass}`}>{throughputLabel}</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Open orders</span>
          <span className={styles.kpiValue}>{openOrderCount ?? 0}</span>
          <span className={styles.kpiSub}>Awaiting fulfillment</span>
        </div>
      </div>

      {/* Charts */}
      <div className={styles.chartRow}>
        <FinanceChartCard supabase={supabase} tenantId={tenantId} />
        <OrdersChartCard supabase={supabase} tenantId={tenantId} />
      </div>

      {/* Bottom: open orders + low stock */}
      <div className={styles.bottomRow}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Live queue</p>
              <h3 className={styles.cardTitle}>Open orders</h3>
            </div>
            <Link href="/app/orders" className={styles.viewAll}>View all</Link>
          </div>
          {(openOrders ?? []).length === 0 ? (
            <p className={styles.emptyMsg}>No open orders right now.</p>
          ) : (
            <div className={styles.orderList}>
              {(openOrders ?? []).map((order) => {
                const status = order.status?.toLowerCase() ?? "";
                const variant: "success" | "danger" | "info" =
                  status === "fulfilled" ? "success" : status === "cancelled" ? "danger" : "info";
                const ref = `#${order.order_number ?? order.shopify_order_id ?? order.id.slice(0, 6)}`;
                const date = new Date(order.created_at).toLocaleDateString("en-GB");
                return (
                  <Link key={order.id} href={`/app/orders/${order.id}`} className={styles.orderRow}>
                    <span className={styles.orderRef}>{ref}</span>
                    <span className={styles.orderDate}>{date}</span>
                    <StatusBadge variant={variant}>{order.status}</StatusBadge>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Stock risk</p>
              <h3 className={styles.cardTitle}>Low stock alerts</h3>
            </div>
            <StatusBadge variant={atRisk.length === 0 ? "success" : atRisk.length > 3 ? "danger" : "warning"}>
              {atRisk.length === 0 ? "All clear" : `${atRisk.length} at risk`}
            </StatusBadge>
          </div>
          {atRisk.length === 0 ? (
            <p className={styles.emptyMsg}>All components above reorder points.</p>
          ) : (
            <div className={styles.alertList}>
              {atRisk.map((b) => {
                const trendClass =
                  b.days === null ? "" :
                  b.days <= 3 ? styles.trendDown :
                  b.days <= 10 ? styles.trendNeutral : styles.trendUp;
                const barPct = b.days !== null ? Math.min((b.days / 30) * 100, 100) : 0;
                return (
                  <div key={b.id} className={styles.alertRow}>
                    <div className={styles.alertBody}>
                      <span className={styles.alertName}>{b.name}</span>
                      <div className={styles.daysBar}>
                        <div className={`${styles.daysBarFill} ${trendClass}`} style={{ width: `${barPct}%` }} />
                      </div>
                    </div>
                    <span className={`${styles.daysVal} ${trendClass}`}>
                      {b.days !== null ? `${b.days}d` : `${b.available} avail`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
