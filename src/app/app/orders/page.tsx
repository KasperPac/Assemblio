import styles from "./orders.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { allocateOrder } from "./actions";

type OrderRow = {
  id: string;
  shopify_order_id: string | null;
  status: string;
  created_at: string;
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
  }>;
};

export default async function OrdersPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const params = (await searchParams) ?? {};
  const [{ data, error }, { data: allocationRows }] = await Promise.all([
    supabase
      .from("orders")
      .select("id,shopify_order_id,status,created_at")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("order_component_allocation")
      .select("quantity,order_line:order_line_id(order_id)"),
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Orders</h1>
          <p>Shopify orders ingest to local lines and allocation workflows.</p>
        </div>
        <form method="post" action="/api/shopify/sync">
          <button className={styles.primary} type="submit">Sync Orders</button>
        </form>
      </div>
      {params.shopify === "sync-ok" ? (
        <p className={styles.syncMeta}>Last sync imported {params.orders ?? "0"} orders.</p>
      ) : null}
      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Order</span>
          <span>Date</span>
          <span>Status</span>
          <span>Allocated</span>
          <span>Channel</span>
          <span>Actions</span>
        </div>
        {error ? (
          <div className={styles.empty}>Failed to load orders.</div>
        ) : (data ?? []).length === 0 ? (
          <div className={styles.empty}>No orders yet.</div>
        ) : (
          (data as OrderRow[]).map((row) => (
            <div key={row.id} className={styles.tableRow}>
              <span>#{row.shopify_order_id ?? row.id.slice(0, 6)}</span>
              <span>{new Date(row.created_at).toLocaleDateString("en-GB")}</span>
              <span className={styles.status}>{row.status}</span>
              <span>
                {(allocationByOrder[row.id]?.lines ?? 0).toString()} / {(allocationByOrder[row.id]?.qty ?? 0).toFixed(2)}
              </span>
              <span>Shopify</span>
              <form action={allocateOrder}>
                <input type="hidden" name="order_id" value={row.id} />
                <button className={styles.allocateBtn} type="submit">
                  Run Allocation
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
