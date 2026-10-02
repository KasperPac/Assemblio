import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./help.module.css";

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/help" className={styles.brand} aria-label="Manuva help centre home">
            <Image src="/manuva-logo.png" alt="Manuva" width={136} height={30} priority />
            <span className={styles.brandLabel}>Help</span>
          </Link>
          <Link href="/app" className={styles.openApp}>
            Open Manuva
          </Link>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <a href="https://manuva.app">manuva.app</a>
        <span aria-hidden="true">·</span>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
