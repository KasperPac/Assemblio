import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";

type Props = { supabase: SupabaseClient; tenantId: string };

function getISOWeekBounds(weeksAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - dayOfWeek - weeksAgo * 7);
  thisMonday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  return { start: thisMonday, end: nextMonday };
}

export async function ProductionThroughput({ supabase, tenantId }: Props) {
  const thisWeek = getISOWeekBounds(0);
  const lastWeek = getISOWeekBounds(1);

  const [{ count: thisCount }, { count: lastCount }] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("historical", false)
      .eq("status", "fulfilled")
      .gte("updated_at", thisWeek.start.toISOString())
      .lt("updated_at", thisWeek.end.toISOString()),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("historical", false)
      .eq("status", "fulfilled")
      .gte("updated_at", lastWeek.start.toISOString())
      .lt("updated_at", lastWeek.end.toISOString()),
  ]);

  const current = thisCount ?? 0;
  const prior   = lastCount ?? 0;
  const diff    = current - prior;
  const trendClass = diff > 0 ? styles.trendUp : diff < 0 ? styles.trendDown : styles.trendWarn;
  const trendLabel = diff > 0 ? `↑ ${diff} vs last week` : diff < 0 ? `↓ ${Math.abs(diff)} vs last week` : "Same as last week";

  return (
    <div className={styles.stat}>
      <p className={styles.statLabel}>Production throughput</p>
      <p className={styles.statValue}>{current}</p>
      <p className={`${styles.statDetail} ${trendClass}`}>{trendLabel}</p>
    </div>
  );
}
