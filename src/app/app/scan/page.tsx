import Link from "next/link";
import styles from "./scan.module.css";

export default async function ScanHomePage() {
  return (
    <main className={styles.homePage}>
      <div className={styles.homeHeader}>
        <div className={styles.homeTitle}>Manuva</div>
        <div className={styles.homeSubtitle}>Warehouse Scanner</div>
      </div>

      <Link href="/app/scan/stocktake" className={styles.modeCard}>
        <div className={styles.modeCardIcon}>📦</div>
        <div className={styles.modeCardTitle}>Count Stock</div>
        <div className={styles.modeCardDesc}>
          Scan a location barcode and enter counts into an active stocktake session
        </div>
      </Link>

      <Link href="/app/scan/locate" className={styles.modeCard}>
        <div className={styles.modeCardIcon}>📍</div>
        <div className={styles.modeCardTitle}>Set Locations</div>
        <div className={styles.modeCardDesc}>
          Scan a location and manage which components live there
        </div>
      </Link>

      <div className={styles.homeFooter}>
        <Link href="/app" className={styles.desktopLink}>
          ↗ Open desktop app
        </Link>
      </div>
    </main>
  );
}
