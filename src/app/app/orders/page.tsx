// src/app/app/orders/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "./orders.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";
import { getOrdersPipelineRollup } from "@/lib/orders/pipeline-rollup";
import { daysLate } from "@/lib/orders/target-ship";
import {
  ComponentsPill,
  ProductionPill,
  DeliveryPill,
} from "./_components/pipeline-pills";

type TabKey = "open" | "in-production" | "ready-to-ship" | "done" | "all";

const TAB_LABELS: Record<TabKey, string> = {
  open: "Open",
  "in-production": "In production",
  "ready-to-ship": "Ready to ship",
  done: "Done",
  all: "All",
};

function parseTab(value: string | undefined): TabKey {
  if (
    value === "open" ||
    value === "in-production" ||
    value === "ready-to-ship" ||
    value === "done" ||
    value === "all"
  ) {
    return value;
  }
  return "open";
}

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_email: string | null;
  status: string;
  source: string;
  target_ship_date: string | null;
  created_at: string;
};

type OrderLineRef = { order_id: string; line_sell_price: number };

type Props = {
  searchParams?: Promise<{
    tab?: string;
    shopify?: string;
    orders?: string;
    sync_error?: string;
  }>;
};

function formatDate(d: Date): string {
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  };
  return d.toLocaleDateString("en-AU", opts);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function customerLabel(email: string | null): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function sourceChipText(source: string): string {
  return source === "shopify" ? "Shopify" : "B2B";
}

export default async function OrdersPage({ searchParams }: Props) {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;
  const params = (await searchParams) ?? {};
  const activeTab = parseTab(params.tab);

  const { data: orderData, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_email, status, source, target_ship_date, created_at"
    )
    .eq("tenant_id", tenantId)
    .order("target_ship_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const allOrders = ((orderData ?? []) as OrderRow[]).filter(
    (o) => o.status !== "cancelled"
  );

  const { data: orderLineData } = await (allOrders.length > 0
    ? supabase
        .from("order_line")
        .select("order_id, line_sell_price")
        .in(
          "order_id",
          allOrders.map((o) => o.id)
        )
    : Promise.resolve({ data: [] as OrderLineRef[] }));

  const totalByOrder = ((orderLineData ?? []) as OrderLineRef[]).reduce<
    Record<string, number>
  >((acc, line) => {
    acc[line.order_id] = (acc[line.order_id] ?? 0) + Number(line.line_sell_price ?? 0);
    return acc;
  }, {});

  const rollups = await getOrdersPipelineRollup(supabase, tenantId, allOrders);

  function matchesTab(orderId: string, tab: TabKey): boolean {
    const r = rollups.get(orderId);
    if (!r) return false;
    if (tab === "all") return true;
    if (tab === "done") return r.delivery === "shipped";
    if (tab === "in-production") return r.production === "in-progress";
    if (tab === "ready-to-ship")
      return r.production === "done" && r.delivery !== "shipped";
    // open
    return r.production !== "done" || r.delivery !== "shipped";
  }

  const counts: Record<TabKey, number> = {
    open: 0,
    "in-production": 0,
    "ready-to-ship": 0,
    done: 0,
    all: allOrders.length,
  };
  for (const o of allOrders) {
    if (matchesTab(o.id, "open")) counts.open++;
    if (matchesTab(o.id, "in-production")) counts["in-production"]++;
    if (matchesTab(o.id, "ready-to-ship")) counts["ready-to-ship"]++;
    if (matchesTab(o.id, "done")) counts.done++;
  }

  const visibleOrders = allOrders.filter((o) => matchesTab(o.id, activeTab));
  const now = new Date();
  const columnsTemplate =
    "1.1fr 0.9fr 0.9fr 0.6fr 0.9fr 0.8fr 0.8fr 0.4fr";

  return (
    <div className={styles.page}>
      <PageHeader
        description="Pipeline view: component readiness, production state, and delivery state per order."
        actions={
          <form method="post" action="/api/shopify/sync?return_to=/app/orders">
            <button className={styles.primary} type="submit">
              Sync orders
            </button>
          </form>
        }
      />

      {params.shopify === "sync-ok" ? (
        <p className={styles.syncMeta}>
          Sync complete — {params.orders ?? "0"} orders imported.
        </p>
      ) : params.shopify === "sync-failed" ? (
        <p className={styles.syncError}>{params.sync_error ?? "Sync failed."}</p>
      ) : null}

      <nav className={styles.tabBar} aria-label="Orders filter">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
          <Link
            key={tab}
            href={`/app/orders?tab=${tab}`}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
          >
            {TAB_LABELS[tab]}{" "}
            <span className={styles.tabCount}>{counts[tab]}</span>
          </Link>
        ))}
      </nav>

      <ListPanel
        eyebrow="Pipeline"
        title={TAB_LABELS[activeTab]}
        columns={[
          "Order",
          "Customer",
          "Target ship",
          "Total",
          "Components",
          "Production",
          "Delivery",
          "",
        ]}
        columnsTemplate={columnsTemplate}
      >
        {error ? (
          <EmptyState
            title="Failed to load orders"
            message={`Supabase: ${error.message}.`}
          />
        ) : visibleOrders.length === 0 ? (
          <EmptyState
            title="No orders in this view"
            message="Try a different tab or sync orders to populate the queue."
          />
        ) : (
          visibleOrders.map((row) => {
            const rollup = rollups.get(row.id);
            const orderTotal = totalByOrder[row.id] ?? 0;
            const target = rollup?.targetShipDate ?? null;
            const overdue = rollup?.isOverdue ?? false;
            const lateDays = overdue && target ? daysLate(target, now) : 0;

            return (
              <ListRow
                key={row.id}
                columnsTemplate={columnsTemplate}
                className={styles.orderRow}
              >
                <Link href={`/app/orders/${row.id}`} className={styles.orderLink}>
                  {row.order_number ?? row.id.slice(0, 8)}
                </Link>
                <span className={styles.meta}>
                  {customerLabel(row.customer_email)}{" "}
                  <span className={styles.sourceChip}>
                    ({sourceChipText(row.source)})
                  </span>
                </span>
                <span
                  className={overdue ? styles.overdue : styles.meta}
                >
                  {target ? formatDate(target) : "—"}
                  {overdue ? ` · ${lateDays}d late` : ""}
                </span>
                <span className={styles.meta}>
                  {orderTotal > 0 ? formatCurrency(orderTotal) : "—"}
                </span>
                {rollup ? (
                  <ComponentsPill state={rollup.components} />
                ) : (
                  <span className={styles.meta}>—</span>
                )}
                {rollup ? (
                  <ProductionPill state={rollup.production} />
                ) : (
                  <span className={styles.meta}>—</span>
                )}
                {rollup ? (
                  <DeliveryPill state={rollup.delivery} />
                ) : (
                  <span className={styles.meta}>—</span>
                )}
                <Link
                  href={`/app/orders/${row.id}`}
                  className={styles.viewLink}
                >
                  View →
                </Link>
              </ListRow>
            );
          })
        )}
      </ListPanel>
    </div>
  );
}
