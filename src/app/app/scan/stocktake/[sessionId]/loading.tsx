import Link from "next/link";
import styles from "../../scan.module.css";

export default function StocktakeSessionLoading() {
  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className={styles.topBar}>
        <Link href="/app/scan/stocktake" className={styles.backBtn}>← Sessions</Link>
        <span className={styles.topBarTitle}>Stocktake</span>
      </div>
      <div className={styles.scanContent}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} aria-label="Loading" />
          <p className={styles.loadingText}>Loading…</p>
        </div>
      </div>
    </main>
  );
}
