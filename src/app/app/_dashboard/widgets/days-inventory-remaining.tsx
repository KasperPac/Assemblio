import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import { calcDaysRemaining } from "@/lib/dashboard/calculations";

type Props = { supabase: SupabaseClient; tenantId: string };

export async function DaysInventoryRemaining({ supabase, tenantId }: Props) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: components }, { data: balances }, { data: bomUsage }, { data: recentOrders }] = await Promise.all([
    supabase.from("component").select("id,name,reorder_point").eq("tenant_id", tenantId),
    supabase.from("inventory_balance").select("component_id,on_hand,reserved").eq("tenant_id", tenantId),
    supabase.from("bom_component").select("component_id,quantity").eq("tenant_id", tenantId),
    supabase.from("orders").select("id").eq("tenant_id", tenantId).eq("historical", false).eq("status", "fulfilled").gte("updated_at", thirtyDaysAgo),
  ]);

  const orderCount = (recentOrders ?? []).length;

  const burnByComponent = new Map<string, number>();
  (bomUsage ?? []).forEach((bc) => {
    const current = burnByComponent.get(bc.component_id) ?? 0;
    burnByComponent.set(bc.component_id, current + (Number(bc.quantity ?? 0) * orderCount) / 30);
  });

  const nameMap    = new Map((components ?? []).map((c) => [c.id, c.name ?? "Unknown"]));

  const rows = (balances ?? [])
    .map((b) => {
      const burn = burnByComponent.get(b.component_id) ?? 0;
      const days = calcDaysRemaining(Number(b.on_hand ?? 0), Number(b.reserved ?? 0), burn);
      return { id: b.component_id, name: nameMap.get(b.component_id) ?? "Unknown", days };
    })
    .filter((r): r is typeof r & { days: number } => r.days !== null && r.days < 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Stock runway</p>
          <h3 className={styles.title}>Days of inventory remaining</h3>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className={styles.emptyText}>All components have 30+ days of stock remaining.</p>
      ) : (
        <div className={styles.rowList}>
          {rows.map((r) => {
            const trendClass = r.days <= 3 ? styles.trendDown : r.days <= 10 ? styles.trendWarn : styles.trendUp;
            return (
              <div key={r.id} className={styles.row}>
                <span className={styles.rowLabel}>{r.name}</span>
                <strong className={`${styles.daysValue} ${trendClass}`}>{r.days}d</strong>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
