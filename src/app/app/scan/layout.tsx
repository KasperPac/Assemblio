import type { ReactNode } from "react";
import styles from "./scan.module.css";

export const metadata = {
  title: "Manuva Scanner",
  description: "Warehouse barcode scanner",
  manifest: "/app/scan/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#15314D",
};

export default function ScanLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {children}
    </div>
  );
}
