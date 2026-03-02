import styles from "./help.module.css";

const quickLinks = [
  {
    title: "Dashboard",
    href: "/app",
    description: "Operational KPI overview and alerts.",
  },
  {
    title: "Inventory",
    href: "/app/inventory",
    description: "Review balances and log inventory movements.",
  },
  {
    title: "Orders",
    href: "/app/orders",
    description: "Track imported orders and fulfillment state.",
  },
  {
    title: "Settings",
    href: "/app/settings",
    description: "Shopify connection and tenant-level defaults.",
  },
  {
    title: "Reports",
    href: "/app/reports",
    description: "Integrity checks, reconciliation drift, and KPI rollups.",
  },
];

const runbooks = [
  {
    title: "Connect Shopify Store",
    steps: [
      "Go to Settings and enter your-store.myshopify.com.",
      "Complete OAuth and return to Settings.",
      "Run a manual sync from the Connected Stores section.",
    ],
  },
  {
    title: "Record Inventory Adjustment",
    steps: [
      "Open Inventory and select component + location.",
      "Choose a reason and enter on-hand / in-prod deltas.",
      "Submit and verify the movement appears in Recent movements.",
    ],
  },
  {
    title: "Diagnose Build Failures",
    steps: [
      "Run npm run build for strict type checks.",
      "Fix route/query relation typing first (array/object unions).",
      "Re-run npm run lint and npm run build before handoff.",
    ],
  },
  {
    title: "Run Integrity Audit",
    steps: [
      "Open Settings and confirm the Inventory Integrity card is healthy.",
      "Open Reports to inspect invariant, drift, allocation, and PO receipt sections.",
      "Run npm run ops:integrity with Supabase service env vars for CLI validation.",
    ],
  },
];

export default function HelpPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Help & Docs</h1>
        <p>Runbooks, quick links, and commands for operating Assemblio.</p>
      </div>
      <div className={styles.grid}>
        <section className={styles.card}>
          <h3>Quick Links</h3>
          <div className={styles.linkList}>
            {quickLinks.map((link) => (
              <a key={link.href} href={link.href} className={styles.linkRow}>
                <span>{link.title}</span>
                <p>{link.description}</p>
              </a>
            ))}
          </div>
        </section>
        <section className={styles.card}>
          <h3>Runbooks</h3>
          <div className={styles.runbookList}>
            {runbooks.map((runbook) => (
              <article key={runbook.title} className={styles.runbookItem}>
                <h4>{runbook.title}</h4>
                {runbook.steps.map((step, index) => (
                  <p key={`${runbook.title}-${index}`}>
                    {index + 1}. {step}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </section>
      </div>
      <div className={styles.commands}>
        <h3>Useful Commands</h3>
        <code>npm run dev</code>
        <code>npm run lint</code>
        <code>npm run build</code>
        <code>npm run ops:integrity</code>
        <code>GET /api/internal/integrity</code>
        <code>python scripts/task_create.py --help</code>
      </div>
    </div>
  );
}
