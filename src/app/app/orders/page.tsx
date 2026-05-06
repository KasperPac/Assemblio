import Link from "next/link";
import styles from "./orders.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";

type OrderRow = {
  id: string;
  order_number: string | null;
  status: string;
  created_at: string;
};

type OrderLineRef = { order_id: string; variant_id: string; line_sell_price: number };

type Props = {
  searchParams?: Promise<{
    shopify?: string;
    orders?: string;
    sync_error?: string;
  }>;
};

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

  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const orderIds = ((data ?? []) as OrderRow[]).map((o) => o.id);

  const { data: orderLineData } = await (
    orderIds.length > 0
      ? supabase
          .from("order_line")
          .select("order_id,variant_id,line_sell_price")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as OrderLineRef[] })
  );

  const variantIds = [
    ...new Set((orderLineData ?? []).map((l) => (l as { variant_id: string }).variant_id)),
  ];

  const { data: activeBomData } = await (
    variantIds.length > 0
      ? supabase
          .from("product_bom")
          .select("id,variant_id")
          .eq("is_active", true)
          .in("variant_id", variantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; variant_id: string }> })
  );

  const activeBomVariants = new Set(
    (activeBomData ?? []).map((b) => (b as { variant_id: string }).variant_id)
  );

  const linesByOrder = ((orderLineData ?? []) as OrderLineRef[]).reduce<
    Record<string, OrderLineRef[]>
  >((acc, line) => {
    const bucket = acc[line.order_id] ?? [];
    bucket.push(line);
    acc[line.order_id] = bucket;
    return acc;
  }, {});

  const totalByOrder = ((orderLineData ?? []) as OrderLineRef[]).reduce<Record<string, number>>(
    (acc, line) => {
      acc[line.order_id] = (acc[line.order_id] ?? 0) + Number(line.line_sell_price ?? 0);
      return acc;
    },
    {}
  );

  function formatOrderDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
  }

  type BadgeState = "allocated" | "partial" | "no-boms" | "no-lines" | "done";

  function getOrderBadgeState(order: OrderRow, lines: OrderLineRef[]): BadgeState {
    const status = order.status.toLowerCase();
    if (status === "fulfilled" || status === "cancelled") return "done";
    if (lines.length === 0) return "no-lines";
    const withBom = lines.filter((l) => activeBomVariants.has(l.variant_id));
    if (withBom.length === lines.length) return "allocated";
    if (withBom.length === 0) return "no-boms";
    return "partial";
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Orders"
        title="Order queue"
        description="Orders sync and allocate automatically. Re-run allocation from the order detail if BOMs change."
        actions={
          <form method="post" action="/api/shopify/sync?return_to=/app/orders">
            <button className={styles.primary} type="submit">
              Sync orders
            </button>
          </form>
        }
      />

      {params.shopify === "sync-ok" ? (
        <p className={styles.syncMeta}>Sync complete — {params.orders ?? "0"} orders imported.</p>
      ) : params.shopify === "sync-failed" ? (
        <p className={styles.syncError}>{params.sync_error ?? "Sync failed."}</p>
      ) : null}

      <ListPanel
        eyebrow="Live queue"
        title="Orders ready for action"
        description="Allocation status updates automatically on every sync. Open an order to re-run or inspect components."
        columns={["Order", "Date", "Total", "Items", "Status", "Allocation", ""]}
        columnsTemplate="1fr 0.8fr 0.8fr 0.5fr 0.7fr 1fr 0.4fr"
      >
        {error ? (
          <EmptyState
            title="Failed to load orders"
            message={`Supabase: ${error.message}. Check supabase/patches/ for any unapplied migrations.`}
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            title="No orders yet"
            message="Sync Shopify orders to populate the order queue."
          />
        ) : (
          ((data ?? []) as OrderRow[]).map((row) => {
            const lines = linesByOrder[row.id] ?? [];
            const badge = getOrderBadgeState(row, lines);
            const missingCount = lines.filter((l) => !activeBomVariants.has(l.variant_id)).length;

            const orderTotal = totalByOrder[row.id] ?? 0;

            return (
              <ListRow
                key={row.id}
                columnsTemplate="1fr 0.8fr 0.8fr 0.5fr 0.7fr 1fr 0.4fr"
                className={styles.orderRow}
              >
                <Link href={`/app/orders/${row.id}`} className={styles.orderLink}>
                  {row.order_number ?? row.id.slice(0, 8)}
                </Link>
                <span className={styles.meta}>{formatOrderDate(row.created_at)}</span>
                <span className={styles.meta}>
                  {orderTotal > 0 ? formatCurrency(orderTotal) : "—"}
                </span>
                <span className={styles.meta}>
                  {lines.length} {lines.length === 1 ? "item" : "items"}
                </span>
                <StatusBadge variant={getStatusVariant(row.status)}>{row.status}</StatusBadge>
                <div>
                  {badge === "allocated" && (
                    <StatusBadge variant="success">✓ Allocated</StatusBadge>
                  )}
                  {badge === "partial" && (
                    <StatusBadge variant="warning">
                      ⚠ {missingCount} line{missingCount === 1 ? "" : "s"} need BOM
                    </StatusBadge>
                  )}
                  {badge === "no-boms" && (
                    <StatusBadge variant="danger">⚠ No BOMs set up</StatusBadge>
                  )}
                  {(badge === "done" || badge === "no-lines") && (
                    <span className={styles.meta}>—</span>
                  )}
                </div>
                <Link href={`/app/orders/${row.id}`} className={styles.viewLink}>
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
