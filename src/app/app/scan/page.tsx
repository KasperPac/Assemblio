import Image from "next/image";
import Link from "next/link";
import styles from "./scan.module.css";

function IconBox() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function IconMapPin() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export default async function ScanHomePage() {
  return (
    <main className={styles.homePage}>
      <div className={styles.homeHeader}>
        <Image src="/manuva.svg" alt="Manuva" width={180} height={98} priority />
        <div className={styles.homeSubtitle}>Warehouse Scanner</div>
      </div>

      <Link href="/app/scan/stocktake" className={styles.modeCard}>
        <div className={styles.modeCardIcon}><IconBox /></div>
        <div className={styles.modeCardTitle}>Count Stock</div>
        <div className={styles.modeCardDesc}>
          Scan a location barcode and enter counts into an active stocktake session
        </div>
      </Link>

      <Link href="/app/scan/locate" className={styles.modeCard}>
        <div className={styles.modeCardIcon}><IconMapPin /></div>
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
