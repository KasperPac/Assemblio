"use client";

import { useState } from "react";
import styles from "./profitability.module.css";
import ByJobTab, { type JobRow } from "./by-job-tab";
import ByProductTab, { type ProductRow } from "./by-product-tab";

type Props = {
  jobs: JobRow[];
  products: ProductRow[];
};

const TABS = ["By Job", "By Product"] as const;
type Tab = (typeof TABS)[number];

export default function ProfitabilityTabs({ jobs, products }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("By Job");
  const [variantFilter, setVariantFilter] = useState<string | null>(null);

  function handleProductClick(variantId: string) {
    setVariantFilter(variantId);
    setActiveTab("By Job");
  }

  return (
    <div>
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
            onClick={() => {
              setActiveTab(tab);
              if (tab === "By Product") setVariantFilter(null);
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      {activeTab === "By Job" && (
        <ByJobTab jobs={jobs} variantFilter={variantFilter} />
      )}
      {activeTab === "By Product" && (
        <ByProductTab products={products} onVariantClick={handleProductClick} />
      )}
    </div>
  );
}
