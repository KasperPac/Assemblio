import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";

type Props = { supabase: SupabaseClient; tenantId: string };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function InventoryValueSnapshot({ supabase, tenantId }: Props) {
  const { data: balances } = await supabase
    .from("inventory_balance")
    .select("on_hand,in_prod,reserved,component:component_id(cost_per_unit)")
    .eq("tenant_id", tenantId);

  const rows = balances ?? [];
  const costOf = (qty: number, row: typeof rows[0]) =>
    qty * Number(firstOf(row.component)?.cost_per_unit ?? 0);

  const onHand   = rows.reduce((s, r) => s + costOf(Number(r.on_hand ?? 0), r), 0);
  const inProd   = rows.reduce((s, r) => s + costOf(Number(r.in_prod ?? 0), r), 0);
  const reserved = rows.reduce((s, r) => s + costOf(Number(r.reserved ?? 0), r), 0);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Stock position</p>
          <h3 className={styles.title}>Inventory value</h3>
        </div>
      </div>
      <div className={styles.rowList}>
        <div className={styles.row}><span className={styles.rowLabel}>On hand</span><strong>{formatCurrency(onHand)}</strong></div>
        <div className={styles.row}><span className={styles.rowLabel}>In production</span><strong>{formatCurrency(inProd)}</strong></div>
        <div className={styles.row}><span className={styles.rowLabel}>Reserved</span><strong>{formatCurrency(reserved)}</strong></div>
      </div>
    </div>
  );
}
