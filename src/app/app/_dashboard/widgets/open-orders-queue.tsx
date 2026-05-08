import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import styles from "../widget.module.css";
import StatusBadge from "../../_ui/status-badge";
import EmptyState from "../../_ui/empty-state";

type Props = { supabase: SupabaseClient; tenantId: string };

export async function OpenOrdersQueue({ supabase, tenantId }: Props) {
  const { data: orders } = await supabase
    .from("orders")
    .select("id,shopify_order_id,order_number,status,created_at")
    .eq("tenant_id", tenantId)
    .neq("status", "fulfilled")
    .order("created_at", { ascending: false })
    .limit(5);

  const { count: openCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .neq("status", "fulfilled");

  const list = orders ?? [];

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Live queue</p>
          <h3 className={styles.title}>Open orders</h3>
        </div>
        <Link href="/app/orders" className={styles.viewAllLink}>
          View all ({openCount ?? 0})
        </Link>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No open orders" message="All orders are fulfilled or no orders have been synced yet." />
      ) : (
        <div className={styles.rowList}>
          {list.map((order) => {
            const status = order.status?.toLowerCase() ?? "";
            const variant = status === "fulfilled" ? "success" : status === "cancelled" ? "danger" : "info";
            const label = `#${order.order_number ?? order.shopify_order_id ?? order.id.slice(0, 6)}`;
            const date = new Date(order.created_at).toLocaleDateString("en-GB");
            return (
              <Link key={order.id} href={`/app/orders/${order.id}`} className={`${styles.row} ${styles.rowLink}`}>
                <div>
                  <strong className={styles.rowLabel}>{label}</strong>
                  <p className={styles.rowMeta}>{date}</p>
                </div>
                <StatusBadge variant={variant}>{order.status}</StatusBadge>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
