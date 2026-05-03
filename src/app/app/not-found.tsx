import Link from "next/link";
import styles from "../not-found.module.css";

export default function AppNotFound() {
  return (
    <main className={styles.wrapper}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>404</p>
        <h1 className={styles.title}>Route not found</h1>
        <p className={styles.body}>
          That workspace surface does not exist. Pick a destination from the
          sidebar or jump back to the dashboard.
        </p>
        <div className={styles.actions}>
          <Link href="/app" className={styles.primary}>
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
