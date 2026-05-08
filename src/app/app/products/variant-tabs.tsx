"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import styles from "./variant-detail.module.css";

export type Tab = "overview" | "bom" | "routing" | "versions" | "notifications";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  bom: "Bill of Materials",
  routing: "Labour & Routing",
  versions: "Versions",
  notifications: "Notifications",
};

const VALID_TABS = new Set<Tab>(["overview", "bom", "routing", "versions", "notifications"]);

type Props = {
  defaultTab?: Tab;
  overview: React.ReactNode;
  bom: React.ReactNode;
  routing: React.ReactNode;
  versions: React.ReactNode;
  notifications: React.ReactNode;
};

export default function VariantTabs({
  defaultTab = "bom",
  overview,
  bom,
  routing,
  versions,
  notifications,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlTab = searchParams.get("tab") as Tab | null;
  const active: Tab = urlTab && VALID_TABS.has(urlTab) ? urlTab : defaultTab;

  function handleTabClick(tab: Tab) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", tab);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

  const content: Record<Tab, React.ReactNode> = { overview, bom, routing, versions, notifications };

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
      <div className={styles.tabContent}>{content[active]}</div>
    </div>
  );
}
