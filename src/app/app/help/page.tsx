import PageHeader from "../_ui/page-header";
import ListPanel, { ListRow } from "../_ui/list-panel";
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

const commands = [
  "npm run dev",
  "npm run lint",
  "npm run build",
  "npm run ops:integrity",
  "GET /api/internal/integrity",
  "python scripts/task_create.py --help",
];

export default function HelpPage() {
  return (
    <div className={styles.page}>
      <PageHeader
        description="Quick links, common procedures, and the core commands used to operate and troubleshoot Assemblio."
      />

      <div className={styles.grid}>
        <ListPanel
          eyebrow="Navigation"
          title="Quick links"
          description="Jump straight into the most-used operational surfaces."
        >
          <div className={styles.linkList}>
            {quickLinks.map((link) => (
              <a key={link.href} href={link.href} className={styles.linkRow}>
                <strong>{link.title}</strong>
                <p>{link.description}</p>
              </a>
            ))}
          </div>
        </ListPanel>

        <ListPanel
          eyebrow="Runbooks"
          title="Common operating procedures"
          description="Use these sequences as the default path for routine admin and troubleshooting tasks."
        >
          <div className={styles.runbookList}>
            {runbooks.map((runbook) => (
              <article key={runbook.title} className={styles.runbookItem}>
                <h3>{runbook.title}</h3>
                {runbook.steps.map((step, index) => (
                  <p key={`${runbook.title}-${index}`}>
                    {index + 1}. {step}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </ListPanel>
      </div>

      <ListPanel
        eyebrow="Commands"
        title="Useful local commands"
        description="The fastest way to validate app health, build quality, and integrity status from the workspace."
      >
        {commands.map((command) => (
          <ListRow key={command} columnsTemplate="1fr" className={styles.commandRow}>
            <code>{command}</code>
          </ListRow>
        ))}
      </ListPanel>
    </div>
  );
}
