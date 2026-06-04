import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";

type Props = { supabase: SupabaseClient; tenantId: string };

export async function OnTimeFulfillment({ supabase, tenantId }: Props) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data } = await supabase
    .from("orders")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("historical", false)
    .gte("created_at", sixMonthsAgo.toISOString());

  const rows = data ?? [];
  const placed = rows.length;
  const fulfilled = rows.filter((r) => r.status === "fulfilled").length;
  const rate = placed > 0 ? Math.round((fulfilled / placed) * 100) : 0;
  const trend = rate >= 90 ? "Up" : rate >= 70 ? "Warn" : "Down";

  return (
    <div className={styles.stat}>
      <p className={styles.statLabel}>On-time fulfillment</p>
      <p className={styles.statValue}>{rate}%</p>
      <p className={`${styles.statDetail} ${styles[`trend${trend}`]}`}>
        {fulfilled} of {placed} orders fulfilled (6 months)
      </p>
    </div>
  );
}
