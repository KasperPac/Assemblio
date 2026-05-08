import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import { calcTurnoverRatio } from "@/lib/dashboard/calculations";

type Props = { supabase: SupabaseClient; tenantId: string };

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function InventoryTurnover({ supabase, tenantId }: Props) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: snapshots }, { data: balances }] = await Promise.all([
    supabase
      .from("job_cost_snapshot")
      .select("material_cost,created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", ninetyDaysAgo),
    supabase
      .from("inventory_balance")
      .select("on_hand,component:component_id(cost_per_unit)")
      .eq("tenant_id", tenantId),
  ]);

  const cogs90d = (snapshots ?? []).reduce((s, r) => s + Number(r.material_cost ?? 0), 0);

  const currentValue = (balances ?? []).reduce((s, r) => {
    const cpu = Number(firstOf(r.component)?.cost_per_unit ?? 0);
    return s + Number(r.on_hand ?? 0) * cpu;
  }, 0);

  // inventory_balance has no historical snapshots; current value proxies the period average
  const ratio = calcTurnoverRatio(cogs90d, currentValue, currentValue);
  const display = ratio !== null ? `${ratio}×` : "—";
  const detail = ratio !== null
    ? ratio >= 4 ? "↑ Strong inventory velocity" : ratio >= 2 ? "Moderate — industry avg ~3×" : "↓ Slow — consider reducing stock"
    : "Insufficient order data";

  const trendClass = ratio !== null
    ? ratio >= 4 ? styles.trendUp : ratio >= 2 ? styles.trendWarn : styles.trendDown
    : "";

  return (
    <div className={styles.stat}>
      <p className={styles.statLabel}>Inventory turnover</p>
      <p className={styles.statValue}>{display}</p>
      <p className={`${styles.statDetail} ${trendClass}`}>{detail}</p>
    </div>
  );
}
