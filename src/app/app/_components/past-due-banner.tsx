import Link from "next/link";
import styles from "./past-due-banner.module.css";

export function PastDueBanner() {
  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>
        <strong className={styles.lead}>Payment failed.</strong>{" "}
        Update your payment method within 3 days to keep your workspace active.
      </span>
      <Link href="/app/billing/past-due" className={styles.cta}>
        Update payment →
      </Link>
    </div>
  );
}
