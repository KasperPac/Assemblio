import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import StatusBadge from "../../_ui/status-badge";
import { findInventoryInvariantIssues } from "@/lib/inventory/invariants";

type Props = { supabase: SupabaseClient; tenantId: string };

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function BomHealth({ supabase, tenantId }: Props) {
  const [{ data: variants }, { data: activeBoms }, { data: balances }] = await Promise.all([
    supabase.from("product_variant").select("id").eq("tenant_id", tenantId),
    supabase.from("product_bom").select("variant_id").eq("tenant_id", tenantId).eq("is_active", true),
    supabase.from("inventory_balance").select("component_id,on_hand,in_prod,reserved,component:component_id(name),location:location_id(name)").eq("tenant_id", tenantId),
  ]);

  const activeBomIds = new Set((activeBoms ?? []).map((r) => r.variant_id));
  const totalVariants = (variants ?? []).length;
  const missingBoms = (variants ?? []).filter((v) => !activeBomIds.has(v.id)).length;
  const coverage = totalVariants > 0 ? Math.round((activeBomIds.size / totalVariants) * 100) : 0;

  const issues = findInventoryInvariantIssues(
    (balances ?? []).map((r) => ({
      componentName: firstOf(r.component)?.name ?? "Unknown",
      locationName: firstOf(r.location)?.name ?? "Unknown",
      onHand: Number(r.on_hand ?? 0),
      inProd: Number(r.in_prod ?? 0),
      reserved: Number(r.reserved ?? 0),
    }))
  );

  const tone = issues.length > 0 ? "danger" : missingBoms > 0 ? "warning" : "success";

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Readiness</p>
          <h3 className={styles.title}>BOM health</h3>
        </div>
        <StatusBadge variant={tone}>{tone === "success" ? "Ready" : "Attention"}</StatusBadge>
      </div>
      <div className={styles.rowList}>
        <div className={styles.row}><span className={styles.rowLabel}>BOM coverage</span><strong>{coverage}%</strong></div>
        <div className={styles.row}><span className={styles.rowLabel}>Missing BOMs</span><strong className={missingBoms > 0 ? styles.trendWarn : undefined}>{missingBoms}</strong></div>
        <div className={styles.row}><span className={styles.rowLabel}>Integrity issues</span><strong className={issues.length > 0 ? styles.trendDown : undefined}>{issues.length}</strong></div>
      </div>
    </div>
  );
}
