import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import StatusBadge from "../../_ui/status-badge";
import { calcDaysRemaining } from "@/lib/dashboard/calculations";

type Props = { supabase: SupabaseClient; tenantId: string };

export async function LowStockAlerts({ supabase, tenantId }: Props) {
  const [{ data: components }, { data: balances }] = await Promise.all([
    supabase.from("component").select("id,name,reorder_point").eq("tenant_id", tenantId),
    supabase.from("inventory_balance").select("component_id,on_hand,reserved").eq("tenant_id", tenantId),
  ]);

  const reorderMap = new Map((components ?? []).map((c) => [c.id, Number(c.reorder_point ?? 0)]));
  const nameMap    = new Map((components ?? []).map((c) => [c.id, c.name ?? "Unknown"]));

  const atRisk = (balances ?? [])
    .map((b) => ({
      id: b.component_id,
      name: nameMap.get(b.component_id) ?? "Unknown",
      onHand: Number(b.on_hand ?? 0),
      reserved: Number(b.reserved ?? 0),
      reorderPoint: reorderMap.get(b.component_id) ?? 0,
    }))
    .filter((b) => b.onHand - b.reserved <= b.reorderPoint)
    .slice(0, 6);

  const statusVariant = atRisk.length === 0 ? "success" : atRisk.length > 3 ? "danger" : "warning";

  // calcDaysRemaining is available for per-row burn-rate display if needed in future iterations
  void calcDaysRemaining;

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
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>All components are above their reorder points.</p>
      ) : (
        <div className={styles.rowList}>
          {atRisk.map((b) => {
            const available = b.onHand - b.reserved;
            return (
              <div key={b.id} className={styles.row}>
                <span className={styles.rowLabel}>{b.name}</span>
                <span className={styles.rowMeta}>{available} avail / {b.reorderPoint} reorder</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
