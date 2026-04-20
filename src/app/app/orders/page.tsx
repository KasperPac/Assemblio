import Link from "next/link";
import styles from "./orders.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { allocateOrder, planOpenOrders } from "./actions";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";

type OrderRow = {
  id: string;
  shopify_order_id: string | null;
  order_number: string | null;
  status: string;
  created_at: string;
};

type MarginSnapshotRow = {
  order_line:
    | { order_id: string }
    | Array<{ order_id: string }>
    | null;
  planned_margin: number;
};

type LaborPlanRow = {
  order_line:
    | { order_id: string }
    | Array<{ order_id: string }>
    | null;
  planned_total_hours: number;
};

type AllocationSummaryRow = {
  order_line:
    | { order_id: string }
    | Array<{ order_id: string }>
    | null;
  quantity: number;
};

type Props = {
  searchParams?: Promise<{
    shopify?: string;
    orders?: string;
    planned?: string;
    planError?: string;
  }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getStatusVariant(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "fulfilled") return "success";
  if (normalized === "cancelled") return "danger";
  if (normalized === "open" || normalized === "pending") return "warning";
  return "info";
}

export default async function OrdersPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const params = (await searchParams) ?? {};
  const [{ data, error }, { data: allocationRows }, { data: marginRows }, { data: laborPlans }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id,shopify_order_id,order_number,status,created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("order_component_allocation")
        .select("quantity,order_line:order_line_id(order_id)"),
      supabase
        .from("job_cost_snapshot")
        .select("planned_margin,order_line:order_line_id(order_id)"),
      supabase
        .from("job_labor_plan")
        .select("planned_total_hours,order_line:order_line_id(order_id)"),
    ]);

  const allocationByOrder = (allocationRows ?? []).reduce<Record<string, { lines: number; qty: number }>>(
    (acc, row) => {
      const typed = row as AllocationSummaryRow;
      const orderLine = Array.isArray(typed.order_line)
        ? typed.order_line[0] ?? null
        : typed.order_line;
      if (!orderLine?.order_id) return acc;
      const current = acc[orderLine.order_id] ?? { lines: 0, qty: 0 };
      acc[orderLine.order_id] = {
        lines: current.lines + 1,
        qty: current.qty + Number(typed.quantity ?? 0),
      };
      return acc;
    },
    {}
  );

  const marginByOrder = ((marginRows ?? []) as MarginSnapshotRow[]).reduce<Record<string, number>>(
    (acc, row) => {
      const orderLine = Array.isArray(row.order_line)
        ? row.order_line[0] ?? null
        : row.order_line;
      if (!orderLine?.order_id) return acc;
      acc[orderLine.order_id] = (acc[orderLine.order_id] ?? 0) + Number(row.planned_margin ?? 0);
      return acc;
    },
    {}
  );

  const laborByOrder = ((laborPlans ?? []) as LaborPlanRow[]).reduce<Record<string, number>>(
    (acc, row) => {
      const orderLine = Array.isArray(row.order_line)
        ? row.order_line[0] ?? null
        : row.order_line;
      if (!orderLine?.order_id) return acc;
      acc[orderLine.order_id] = (acc[orderLine.order_id] ?? 0) + Number(row.planned_total_hours ?? 0);
      return acc;
    },
    {}
  );

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Orders"
        title="Order queue"
        description="Monitor Shopify demand, trigger allocation, and see which orders already have financial and labor plans."
        actions={
          <div className={styles.headerActions}>
            <form action={planOpenOrders}>
              <button className={styles.secondary} type="submit">
                Generate plans
              </button>
            </form>
            <form method="post" action="/api/shopify/sync">
              <button className={styles.primary} type="submit">
                Sync orders
              </button>
            </form>
          </div>
        }
      />

      {params.shopify === "sync-ok" ? (
        <p className={styles.syncMeta}>Last sync imported {params.orders ?? "0"} orders.</p>
      ) : null}
      {params.planned ? (
        <p className={styles.syncMeta}>
          Generated finance plans for {params.planned} open order lines.
        </p>
      ) : null}
      {params.planError ? (
        <p className={styles.errorMeta}>Plan generation failed: {params.planError}</p>
      ) : null}

      <ListPanel
        eyebrow="Live queue"
        title="Orders ready for action"
        description="Allocate component demand, then push labor planning into the schedule with full order-level visibility."
        columns={["Order", "Date", "Status", "Allocated", "Plan", "Actions"]}
        columnsTemplate="0.9fr 0.9fr 0.8fr 0.9fr 1fr 0.9fr"
      >
        {error ? (
          <EmptyState
            title="Failed to load orders"
            message="The order queue could not be loaded from Supabase."
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            title="No orders yet"
            message="Sync Shopify orders to populate the order queue."
          />
        ) : (
          (data as OrderRow[]).map((row) => (
            <ListRow
              key={row.id}
              columnsTemplate="0.9fr 0.9fr 0.8fr 0.9fr 1fr 0.9fr"
              className={styles.orderRow}
            >
              <div className={styles.orderIdentity}>
                <Link href={`/app/orders/${row.id}`} className={styles.orderLink}>
                  #{row.order_number ?? row.shopify_order_id ?? row.id.slice(0, 6)}
                </Link>
                <span className={styles.meta}>Shopify {row.shopify_order_id ?? "--"}</span>
              </div>
              <span className={styles.meta}>
                {new Date(row.created_at).toLocaleDateString("en-GB")}
              </span>
              <StatusBadge variant={getStatusVariant(row.status)}>{row.status}</StatusBadge>
              <div className={styles.metricCell}>
                <strong>{allocationByOrder[row.id]?.lines ?? 0}</strong>
                <span>{(allocationByOrder[row.id]?.qty ?? 0).toFixed(2)} units</span>
              </div>
              <div className={styles.metricCell}>
                <strong>
                  {laborByOrder[row.id]
                    ? `${laborByOrder[row.id].toFixed(1)} hrs`
                    : "Not planned"}
                </strong>
                <span>
                  {laborByOrder[row.id]
                    ? formatCurrency(marginByOrder[row.id] ?? 0)
                    : "No margin snapshot"}
                </span>
              </div>
              <div className={styles.rowActions}>
                <form action={allocateOrder}>
                  <input type="hidden" name="order_id" value={row.id} />
                  <button className={styles.secondaryInline} type="submit">
                    Run allocation
                  </button>
                </form>
              </div>
            </ListRow>
          ))
        )}
      </ListPanel>
    </div>
  );
}
