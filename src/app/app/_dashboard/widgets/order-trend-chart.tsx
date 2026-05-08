import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import { OrderTrendChart } from "../../dashboard-charts";

type Props = { supabase: SupabaseClient; tenantId: string };

export async function OrderTrendChartWidget({ supabase, tenantId }: Props) {
  const now = new Date();
  const start = new Date();
  start.setMonth(now.getMonth() - 5);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("orders")
    .select("status,created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", start.toISOString());

  const buckets = Array.from({ length: 6 }).map((_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      label: date.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      placed: 0,
      fulfilled: 0,
      cancelled: 0,
    };
  });

  (data ?? []).forEach((row) => {
    const created = new Date(row.created_at);
    const idx = (created.getFullYear() - start.getFullYear()) * 12 + created.getMonth() - start.getMonth();
    if (idx >= 0 && idx < buckets.length) {
      buckets[idx].placed += 1;
      if (row.status === "fulfilled") buckets[idx].fulfilled += 1;
      if (row.status === "cancelled") buckets[idx].cancelled += 1;
    }
  });

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Fulfillment flow</p>
          <h3 className={styles.title}>Order trend</h3>
        </div>
      </div>
      <OrderTrendChart data={buckets} />
    </div>
  );
}
