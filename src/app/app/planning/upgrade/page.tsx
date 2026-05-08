import styles from "./upgrade.module.css";

export default function PlanningUpgradePage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.badge}>Add-on</span>
        <h1>Production Planning</h1>
        <p className={styles.subtitle}>
          Schedule jobs across departments, manage queues, and send customers
          real-time production updates — all from one place.
        </p>
        <ul className={styles.features}>
          <li>Department queue boards</li>
          <li>Shop floor app for operators</li>
          <li>Auto &amp; manual job scheduling</li>
          <li>B2C customer notifications at each production milestone</li>
        </ul>
        <p className={styles.cta}>Contact us to enable Production Planning for your workspace.</p>
        <a href="mailto:support@manuva.app" className={styles.button}>
          Get in touch
        </a>
      </div>
    </div>
  );
}
