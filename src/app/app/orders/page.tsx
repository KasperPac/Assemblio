// src/app/app/orders/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "./orders.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import HelpLink from "../_ui/help-link";
import StatusBadge from "../_ui/status-badge";
import { getOrdersPipelineRollup } from "@/lib/orders/pipeline-rollup";
import { daysLate } from "@/lib/orders/target-ship";
import {
  ComponentsPill,
  ProductionPill,
  DeliveryPill,
} from "./_components/pipeline-pills";
import { parseOrdersQuery } from "@/lib/orders/orders-query";
import OrdersFilters from "./_components/orders-filters";
import SortableHeader from "./_components/sortable-header";
import OrdersPagination from "./_components/orders-pagination";

type Props = {
  searchParams?: Promise<Record<string, string | undefined>>;
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
  const { supabase, tenantId: _tenantId } = context;
  const tenantId = _tenantId!; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin
  const params = (await searchParams) ?? {};
  const q = parseOrdersQuery(params as Record<string, string | undefined>);

  const { data: rows, error } = await supabase.rpc("list_orders", {
    p_tenant_id: tenantId,
    p_search: q.search,
    p_status: q.status,
    p_source: q.source,
    p_historical: q.historical,
    p_date_from: q.dateFrom,
    p_date_to: q.dateTo,
    p_sort: q.sort,
    p_dir: q.dir,
    p_limit: q.limit,
    p_offset: q.offset,
  });

  const orderRows = (rows ?? []) as Array<{
    id: string;
    order_number: string | null;
    customer_email: string | null;
    status: string;
    source: string;
    target_ship_date: string | null;
    shopify_processed_at: string | null;
    shopify_created_at: string | null;
    fulfilled_at: string | null;
    historical: boolean;
    order_total: number;
    total_count: number;
  }>;

  const total = Number(orderRows[0]?.total_count ?? 0);

  const { rollups } = await getOrdersPipelineRollup(
    supabase,
    tenantId,
    orderRows.map((o) => ({
      id: o.id,
      status: o.status,
      target_ship_date: o.target_ship_date,
    }))
  );

  const now = new Date();

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Orders"
        title="Orders"
        description="Pipeline view: component readiness, production state, and delivery state per order."
        actions={
          <form method="post" action="/api/shopify/sync?return_to=/app/orders">
            <button className={styles.primary} type="submit">
              Sync orders
            </button>
          </form>
        }
      />
      <HelpLink slug="orders/order-statuses" label="What do order statuses mean?" />

      {params.shopify === "sync-ok" ? (
        <p className={styles.syncMeta}>
          Sync complete — {params.orders ?? "0"} orders imported.
        </p>
      ) : params.shopify === "sync-failed" ? (
        <p className={styles.syncError}>{params.sync_error ?? "Sync failed."}</p>
      ) : null}

      <OrdersFilters />

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortableHeader label="Order" sortKey="order_number" />
              <SortableHeader label="Customer" sortKey="customer_email" />
              <SortableHeader label="Order date" sortKey="order_date" />
              <SortableHeader label="Target ship" sortKey="target_ship_date" />
              <SortableHeader label="Total" sortKey="total" className={styles.cellRight} />
              <th>Components</th>
              <th>Production</th>
              <th>Delivery</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={9} className={styles.emptyCell}>
                  <EmptyState
                    title="Failed to load orders"
                    message={`Supabase: ${error.message}.`}
                  />
                </td>
              </tr>
            ) : orderRows.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyCell}>
                  <EmptyState
                    title="No orders in this view"
                    message="Try adjusting the filters or sync orders to populate the queue."
                  />
                </td>
              </tr>
            ) : (
              orderRows.map((o) => {
                const rollup = rollups.get(o.id);
                const target = rollup?.targetShipDate ?? null;
                const overdue = rollup?.isOverdue ?? false;
                const lateDays = overdue && target ? daysLate(target, now) : 0;
                const orderDate = o.shopify_processed_at ?? o.shopify_created_at;

                return (
                  <tr key={o.id}>
                    <td>
                      <Link
                        href={`/app/orders/${o.id}`}
                        className={styles.orderLink}
                      >
                        {o.order_number ?? o.id.slice(0, 8)}
                      </Link>
                      {o.historical && (
                        <>{" "}<StatusBadge>Historical</StatusBadge></>
                      )}
                    </td>
                    <td>
                      <span className={styles.customerName}>
                        {customerLabel(o.customer_email)}
                      </span>{" "}
                      <span className={styles.sourceChip}>
                        ({sourceChipText(o.source)})
                      </span>
                    </td>
                    <td>
                      {orderDate ? formatDate(new Date(orderDate)) : "—"}
                    </td>
                    <td className={overdue ? styles.overdue : undefined}>
                      {target ? formatDate(target) : "—"}
                      {overdue ? ` · ${lateDays}d late` : ""}
                    </td>
                    <td className={styles.cellRight}>
                      {o.order_total > 0 ? formatCurrency(o.order_total) : "—"}
                    </td>
                    <td>
                      {rollup ? (
                        <ComponentsPill state={rollup.components} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {rollup ? (
                        <ProductionPill state={rollup.production} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {rollup ? (
                        <DeliveryPill state={rollup.delivery} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={styles.cellRight}>
                      <Link
                        href={`/app/orders/${o.id}`}
                        className={styles.viewLink}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <OrdersPagination page={q.page} pageSize={q.pageSize} total={total} />
    </div>
  );
}
