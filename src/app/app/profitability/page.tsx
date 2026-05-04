import styles from "../planning.module.css";
import ProfitabilityTabs from "./profitability-tabs";
import type { JobRow } from "./by-job-tab";
import type { ProductRow } from "./by-product-tab";

export default async function ProfitabilityPage() {
  const jobs: JobRow[] = [];
  const products: ProductRow[] = [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Financial Analytics</span>
          <h1>Profitability</h1>
          <p>Job and product-level margin tracking.</p>
        </div>
      </div>
      <ProfitabilityTabs jobs={jobs} products={products} />
    </div>
  );
}
