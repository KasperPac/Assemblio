import Link from "next/link";
import styles from "./success.module.css";

export const dynamic = "force-dynamic";

export default function BillingSuccessPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          ✓
        </div>
        <h1 className={styles.title}>You&apos;re all set</h1>
        <p className={styles.subtitle}>
          Welcome aboard. Your subscription is active — let&apos;s get you back
          to work.
        </p>
        <Link href="/app" className={styles.primary}>
          Continue to dashboard →
        </Link>
      </div>
    </main>
  );
}
