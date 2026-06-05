import Link from "next/link";
import styles from "../scan.module.css";

export default function LocateLoading() {
  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className={styles.topBar}>
        <Link href="/app/scan" className={styles.backBtn}>← Back</Link>
        <span className={styles.topBarTitle}>Set Locations</span>
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
