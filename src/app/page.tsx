import styles from "./page.module.css";
import Image from "next/image";

const progressByArea = [
  { area: "Core app routes", percent: 94, note: "All major routes rendering with operational actions" },
  { area: "Workflow forms", percent: 82, note: "Create and update flows live on key modules" },
  { area: "Shopify integration", percent: 76, note: "Sync + webhook paths hardened with idempotent allocation reconciliation" },
  { area: "Testing coverage", percent: 48, note: "Unit tests now cover allocation, webhook, stocktake, and integrity audit logic" },
];

const weeklyVelocity = [
  { week: "W1", completed: 6 },
  { week: "W2", completed: 11 },
  { week: "W3", completed: 17 },
  { week: "W4", completed: 24 },
];

const timeline = [
  {
    title: "Foundation",
    date: "Feb 26, 2026",
    detail: "App shell, auth boundary, and inventory data model wired.",
  },
  {
    title: "Operational Pages",
    date: "Mar 1, 2026",
    detail: "Reports, Help, and Trash pages upgraded from placeholders.",
  },
  {
    title: "Workflow Forms",
    date: "Mar 1, 2026",
    detail: "Create flows added for BOM, Suppliers, Purchasing, and Stocktake.",
  },
  {
    title: "Allocation Automation",
    date: "Mar 1, 2026",
    detail: "Shopify sync now runs allocation reconciliation per affected order.",
  },
  {
    title: "Integrity Controls",
    date: "Mar 2, 2026",
    detail: "Settings and Reports now surface invariant, drift, and over-receipt audits.",
  },
];

const screenshots = [
  {
    src: "/rebuild/dashboard.png",
    title: "Dashboard",
    caption: "KPI overview with alerts and order trend visual.",
  },
  {
    src: "/rebuild/orders.png",
    title: "Orders",
    caption: "Recent order pipeline and status visibility.",
  },
  {
    src: "/rebuild/inventory.png",
    title: "Inventory",
    caption: "Balance table, movement feed, and adjustment entry.",
  },
  {
    src: "/rebuild/settings.png",
    title: "Settings",
    caption: "Tenant controls and Shopify connection area.",
  },
];

export default function Home() {
  const maxVelocity = Math.max(...weeklyVelocity.map((w) => w.completed), 1);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} />
          <div>
            <p className={styles.brandTitle}>Assemblio</p>
            <p className={styles.brandSubtitle}>BOM + inventory control</p>
          </div>
        </div>
        <nav className={styles.nav}>
          <a href="#modules">Modules</a>
          <a href="#progress">Progress</a>
          <a href="#how">How it works</a>
          <a href="#gallery">Screens</a>
          <a href="#stack">Stack</a>
        </nav>
        <div className={styles.headerCtas}>
          <a className={styles.ghost} href="/app/help">
            Docs
          </a>
          <a className={styles.primary} href="/login?redirect=/app">
            Request Access
          </a>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>New build - Shopify-ready</p>
            <h1>Availability that operations can trust.</h1>
            <p className={styles.heroBody}>
              Assemblio centralizes BOMs, component inventory, allocations, and
              purchasing. Built for multi-tenant manufacturers who need instant,
              defensible stock positions.
            </p>
            <div className={styles.heroCtas}>
              <a className={styles.primaryLarge} href="/app">
                Launch Sandbox
              </a>
              <a className={styles.secondaryLarge} href="#progress">
                View Roadmap
              </a>
            </div>
            <div className={styles.heroMeta}>
              <div>
                <p className={styles.metaLabel}>Availability</p>
                <p className={styles.metaValue}>On-hand minus reserved</p>
              </div>
              <div>
                <p className={styles.metaLabel}>Updates</p>
                <p className={styles.metaValue}>Movement ledger + balances</p>
              </div>
              <div>
                <p className={styles.metaLabel}>Tenancy</p>
                <p className={styles.metaValue}>Strict tenant isolation</p>
              </div>
            </div>
          </div>
          <div className={styles.heroPanel}>
            <div className={styles.panelHeader}>
              <p>Live Allocation Snapshot</p>
              <span>Tenant: Pac-Technologies</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.panelRow}>
                <div>
                  <p className={styles.panelTitle}>Variant: Aero Clamp</p>
                  <p className={styles.panelSub}>BOM v4 - 12 components</p>
                </div>
                <span className={styles.status}>Allocated</span>
              </div>
              <div className={styles.panelGrid}>
                <div>
                  <p className={styles.panelLabel}>On-hand</p>
                  <p className={styles.panelValue}>4,320</p>
                </div>
                <div>
                  <p className={styles.panelLabel}>Reserved</p>
                  <p className={styles.panelValue}>1,880</p>
                </div>
                <div>
                  <p className={styles.panelLabel}>Available</p>
                  <p className={styles.panelValue}>2,440</p>
                </div>
              </div>
              <div className={styles.panelTimeline}>
                <div>
                  <span />
                  <p>Order #5941 reserved 48 components</p>
                </div>
                <div>
                  <span />
                  <p>PO #2020 received 600 units</p>
                </div>
                <div>
                  <span />
                  <p>Stocktake session adjusted -12 units</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="progress" className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <div>
              <h2>Rebuild Progress</h2>
              <p>Current implementation maturity across core workstreams.</p>
            </div>
            <span className={styles.progressBadge}>Last updated March 2, 2026</span>
          </div>

          <div className={styles.progressGrid}>
            <div className={styles.progressCard}>
              <h3>Workstream Completion</h3>
              <div className={styles.progressList}>
                {progressByArea.map((item) => (
                  <div key={item.area} className={styles.progressItem}>
                    <div className={styles.progressRow}>
                      <span>{item.area}</span>
                      <strong>{item.percent}%</strong>
                    </div>
                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                    <p>{item.note}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.progressCard}>
              <h3>Delivery Velocity</h3>
              <p className={styles.chartLabel}>Completed deliverables per week</p>
              <div className={styles.velocityChart}>
                {weeklyVelocity.map((week) => (
                  <div key={week.week} className={styles.velocityBarWrap}>
                    <div
                      className={styles.velocityBar}
                      style={{ height: `${(week.completed / maxVelocity) * 100}%` }}
                    />
                    <span className={styles.velocityWeek}>{week.week}</span>
                    <span className={styles.velocityCount}>{week.completed}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.timeline}>
            {timeline.map((item) => (
              <article key={item.title} className={styles.timelineCard}>
                <span>{item.date}</span>
                <h4>{item.title}</h4>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="modules" className={styles.modules}>
          <h2>Core modules</h2>
          <div className={styles.moduleGrid}>
            <article>
              <h3>Shopify ingestion</h3>
              <p>Sync products, variants, and orders with idempotent webhooks.</p>
            </article>
            <article>
              <h3>BOM management</h3>
              <p>Versioned BOMs per variant with controlled activation.</p>
            </article>
            <article>
              <h3>Inventory + movements</h3>
              <p>Ledger-first adjustments with auditable balance rollups.</p>
            </article>
            <article>
              <h3>Allocation engine</h3>
              <p>Reserve required components at the tenant default location.</p>
            </article>
            <article>
              <h3>Stocktake</h3>
              <p>Session-based counts with adjustment trails and approvals.</p>
            </article>
            <article>
              <h3>Purchasing</h3>
              <p>Supplier POs, receiving, and inbound movement capture.</p>
            </article>
          </div>
        </section>

        <section id="how" className={styles.flow}>
          <h2>How the pipeline works</h2>
          <div className={styles.flowGrid}>
            <div>
              <p className={styles.flowStep}>1</p>
              <h4>Ingest + normalize</h4>
              <p>
                Shopify data maps to variants, components, and locations in a
                single canonical store.
              </p>
            </div>
            <div>
              <p className={styles.flowStep}>2</p>
              <h4>Allocate with certainty</h4>
              <p>
                Every order line loads the active BOM and writes reservation
                movements.
              </p>
            </div>
            <div>
              <p className={styles.flowStep}>3</p>
              <h4>Audit on demand</h4>
              <p>
                Stocktake sessions reconcile counts into movements and balances.
              </p>
            </div>
          </div>
        </section>

        <section id="stack" className={styles.stack}>
          <div>
            <h2>Stack choices</h2>
            <p>
              This rebuild uses Next.js App Router, TypeScript, and Supabase for
              auth + API. Shopify is read-only for inventory references.
            </p>
          </div>
          <ul className={styles.stackList}>
            <li>
              <span>Supabase</span>
              <p>Postgres, REST, and Edge Functions for service workflows.</p>
            </li>
            <li>
              <span>Next.js</span>
              <p>Server-first UI with typed endpoints and fast iteration.</p>
            </li>
            <li>
              <span>Tenant policy</span>
              <p>All domain reads and writes constrained by tenant context.</p>
            </li>
          </ul>
        </section>

        <section id="gallery" className={styles.gallery}>
          <div className={styles.galleryHeader}>
            <h2>Rebuild Screens</h2>
            <p>Current UI snapshots from active modules.</p>
          </div>
          <div className={styles.galleryGrid}>
            {screenshots.map((shot) => (
              <figure key={shot.src} className={styles.shotCard}>
                <Image
                  src={shot.src}
                  alt={shot.title}
                  width={1200}
                  height={700}
                  className={styles.shotImage}
                />
                <figcaption>
                  <strong>{shot.title}</strong>
                  <p>{shot.caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>Assemblio rebuild - starting 2026.</p>
        <div>
          <span>Ops-first</span>
          <span>Ledger-backed</span>
          <span>Multi-tenant</span>
        </div>
      </footer>
    </div>
  );
}


