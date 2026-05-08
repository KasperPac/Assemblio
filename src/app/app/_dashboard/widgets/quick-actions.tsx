import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";

const ACTIONS = [
  { href: "/app/products",    label: "Build BOMs",          sub: "Create or revise BOMs for high-demand variants" },
  { href: "/app/components",  label: "Review components",   sub: "Check reorder points and stock exposure" },
  { href: "/app/stocktake",   label: "Run stocktake",       sub: "Start a count to reconcile inventory" },
  { href: "/app/settings",    label: "Open settings",       sub: "Check Shopify sync and workspace config" },
];

export function QuickActions(_props: { supabase: SupabaseClient; tenantId: string }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Next actions</p>
          <h3 className={styles.title}>Jump into the work</h3>
        </div>
      </div>
      <div className={styles.actionsGrid}>
        {ACTIONS.map((a) => (
          <a key={a.href} href={a.href} className={styles.actionCard}>
            <strong className={styles.actionCardLabel}>{a.label}</strong>
            <span className={styles.actionCardSub}>{a.sub}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
