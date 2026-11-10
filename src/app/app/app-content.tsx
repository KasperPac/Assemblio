"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getRouteBand } from "./route-meta";
import styles from "./shell.module.css";

/** Match the content accents to the same exact index map as the topbar. */
export default function AppContent({ children }: { children: ReactNode }) {
  const domain = getRouteBand(usePathname())?.domain;
  return (
    <section className={styles.content} data-app-content="" data-domain={domain ?? undefined}>
      {children}
    </section>
  );
}
