"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import styles from "./variant-detail.module.css";

export type Tab = "overview" | "bom" | "routing" | "versions";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  bom: "Bill of Materials",
  routing: "Labour & Routing",
  versions: "Versions",
};

type Props = {
  defaultTab?: Tab;
  children: (activeTab: Tab) => React.ReactNode;
};

export default function VariantTabs({ defaultTab = "bom", children }: Props) {
  const [active, setActive] = useState<Tab>(defaultTab);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleTabClick(tab: Tab) {
    setActive(tab);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", tab);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div className={styles.tabs}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`}
            onClick={() => handleTabClick(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      <div className={styles.tabContent}>{children(active)}</div>
    </div>
  );
}
