import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import Link from "next/link";

type Props = { supabase: SupabaseClient; tenantId: string };

const TERMINAL_STATUSES = ["received", "cancelled", "archived"];

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function PurchasingSignals({ supabase, tenantId }: Props) {
  const [{ data: activePOs }, { data: components }, { data: balances }] = await Promise.all([
    supabase
      .from("purchase_order")
      .select("id,status,created_at,supplier:supplier_id(name)")
      .eq("tenant_id", tenantId)
      .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
      .order("created_at", { ascending: true })
      .limit(5),
    supabase.from("component").select("id,name,reorder_point").eq("tenant_id", tenantId),
    supabase.from("inventory_balance").select("component_id,on_hand,reserved").eq("tenant_id", tenantId),
  ]);

  const reorderMap = new Map((components ?? []).map((c) => [c.id, Number(c.reorder_point ?? 0)]));
  const nameMap    = new Map((components ?? []).map((c) => [c.id, c.name ?? "Unknown"]));

  const lowStock = (balances ?? [])
    .filter((b) => Number(b.on_hand ?? 0) - Number(b.reserved ?? 0) <= (reorderMap.get(b.component_id) ?? 0))
    .slice(0, 3)
    .map((b) => ({ id: b.component_id, label: nameMap.get(b.component_id) ?? "Unknown", type: "stock" as const }));

  const poSignals = (activePOs ?? []).map((po) => ({
    id: po.id,
    label: `PO — ${firstOf(po.supplier)?.name ?? "Unknown supplier"} (${po.status})`,
    type: "po" as const,
  }));

  const all = [...poSignals, ...lowStock].slice(0, 6);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Action needed</p>
          <h3 className={styles.title}>Purchasing signals</h3>
        </div>
        <Link href="/app/purchasing" className={styles.viewAllLink}>
          View all
        </Link>
      </div>
      {all.length === 0 ? (
        <p className={styles.emptyText}>No active POs or low-stock components.</p>
      ) : (
        <div className={styles.rowList}>
          {all.map((sig) => (
            <div key={sig.id} className={styles.row}>
              <span className={styles.rowLabel}>{sig.label}</span>
              <span className={`${styles.badge} ${sig.type === "po" ? styles.badgePo : styles.badgeStock}`}>
                {sig.type === "po" ? "PO" : "Low stock"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
