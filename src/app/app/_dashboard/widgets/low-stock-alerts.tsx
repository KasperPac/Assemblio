import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import StatusBadge from "../../_ui/status-badge";
import { calcDaysRemaining } from "@/lib/dashboard/calculations";

type Props = { supabase: SupabaseClient; tenantId: string };

export async function LowStockAlerts({ supabase, tenantId }: Props) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: components }, { data: balances }, { data: bomUsage }, { data: recentOrders }] = await Promise.all([
    supabase.from("component").select("id,name,reorder_point").eq("tenant_id", tenantId),
    supabase.from("inventory_balance").select("component_id,on_hand,reserved").eq("tenant_id", tenantId),
    supabase.from("bom_component").select("component_id,quantity").eq("tenant_id", tenantId),
    supabase.from("orders").select("id").eq("tenant_id", tenantId).eq("status", "fulfilled").gte("updated_at", thirtyDaysAgo),
  ]);

  const orderCount = (recentOrders ?? []).length;

  const burnByComponent = new Map<string, number>();
  (bomUsage ?? []).forEach((bc) => {
    const current = burnByComponent.get(bc.component_id) ?? 0;
    burnByComponent.set(bc.component_id, current + (Number(bc.quantity ?? 0) * orderCount) / 30);
  });

  const reorderMap = new Map((components ?? []).map((c) => [c.id, Number(c.reorder_point ?? 0)]));
  const nameMap    = new Map((components ?? []).map((c) => [c.id, c.name ?? "Unknown"]));

  const atRisk = (balances ?? [])
    .map((b) => {
      const onHand = Number(b.on_hand ?? 0);
      const reserved = Number(b.reserved ?? 0);
      const days = calcDaysRemaining(onHand, reserved, burnByComponent.get(b.component_id) ?? 0);
      return {
        id: b.component_id,
        name: nameMap.get(b.component_id) ?? "Unknown",
        available: onHand - reserved,
        reorderPoint: reorderMap.get(b.component_id) ?? 0,
        days,
      };
    })
    .filter((b) => b.available <= b.reorderPoint)
    .slice(0, 6);

  const statusVariant = atRisk.length === 0 ? "success" : atRisk.length > 3 ? "danger" : "warning";

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Stock risk</p>
          <h3 className={styles.title}>Low stock alerts</h3>
        </div>
        <StatusBadge variant={statusVariant}>
          {atRisk.length === 0 ? "All clear" : `${atRisk.length} at risk`}
        </StatusBadge>
      </div>
      {atRisk.length === 0 ? (
        <p className={styles.emptyText}>All components are above their reorder points.</p>
      ) : (
        <div className={styles.rowList}>
          {atRisk.map((b) => {
            const trendClass = b.days === null ? "" : b.days <= 3 ? styles.trendDown : b.days <= 10 ? styles.trendWarn : styles.trendUp;
            const barPct = b.days !== null ? Math.min((b.days / 30) * 100, 100) : 0;
            return (
              <div key={b.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <span className={styles.rowLabel}>{b.name}</span>
                  <div className={styles.daysBarWrap}>
                    <div className={`${styles.daysBarFill} ${trendClass}`} style={{ width: `${barPct}%` }} />
                  </div>
                </div>
                <span className={`${styles.daysValue} ${trendClass}`}>
                  {b.days !== null ? `${b.days}d` : `${b.available} avail`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
