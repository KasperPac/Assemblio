import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import { TopProductsChart } from "../../dashboard-charts";

type Props = { supabase: SupabaseClient; tenantId: string };

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function TopProductsDemand({ supabase, tenantId }: Props) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("order_line")
    .select("variant:variant_id(product:product_id(title))")
    .eq("tenant_id", tenantId)
    .gte("created_at", thirtyDaysAgo);

  const counts = (data ?? []).reduce<Record<string, number>>((acc, row) => {
    const title = firstOf(firstOf(row.variant)?.product)?.title ?? "Unknown";
    acc[title] = (acc[title] ?? 0) + 1;
    return acc;
  }, {});

  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({ title, count }));

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Demand mix</p>
          <h3 className={styles.title}>Top products this month</h3>
        </div>
      </div>
      <TopProductsChart data={top} />
    </div>
  );
}
