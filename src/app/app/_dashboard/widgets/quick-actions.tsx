import styles from "../widget.module.css";

const ACTIONS = [
  { href: "/app/products",    label: "Build BOMs",          sub: "Create or revise BOMs for high-demand variants" },
  { href: "/app/components",  label: "Review components",   sub: "Check reorder points and stock exposure" },
  { href: "/app/stocktake",   label: "Run stocktake",       sub: "Start a count to reconcile inventory" },
  { href: "/app/settings",    label: "Open settings",       sub: "Check Shopify sync and workspace config" },
];

export function QuickActions() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Next actions</p>
          <h3 className={styles.title}>Jump into the work</h3>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
        {ACTIONS.map((a) => (
          <a key={a.href} href={a.href} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 18, borderRadius: 18, border: "1px solid color-mix(in srgb, var(--stroke-card) 100%, transparent)", background: "color-mix(in srgb, var(--surface-1) 78%, var(--bg-card))", textDecoration: "none" }}>
            <strong style={{ color: "var(--ink-strong)", fontSize: "0.98rem" }}>{a.label}</strong>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.84rem" }}>{a.sub}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
