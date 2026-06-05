import Link from "next/link";
import styles from "../scan.module.css";

export default function StocktakeListLoading() {
  return (
    <main>
      <div className={styles.topBar}>
        <Link href="/app/scan" className={styles.backBtn}>← Back</Link>
        <span className={styles.topBarTitle}>Count Stock</span>
      </div>
      <div className={styles.scanContent}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} aria-label="Loading" />
          <p className={styles.loadingText}>Loading sessions…</p>
        </div>
      </div>
    </main>
  );
}
