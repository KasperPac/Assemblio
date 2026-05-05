"use client";

import { useState } from "react";
import styles from "./component-detail.module.css";

type StatCard = {
  label: string;
  value: string;
  color?: "default" | "green" | "red" | "orange" | "blue";
  highlight?: "warning" | "danger";
  subText?: string;
  subTextDanger?: boolean;
};

type MovementRow = {
  id: string;
  date: string;
  deltaOnHand: number;
  deltaInProd: number;
  reason: string;
  refType: string;
};

type BomRow = {
  bomId: string;
  product: string;
  variant: string;
  version: number;
  quantity: number;
  active: boolean;
};

type ReceiptRow = {
  date: string;
  supplierName: string;
  reference: string;
  qty: number;
};

type Props = {
  stats: StatCard[];
  movements: MovementRow[];
  bomUsage: BomRow[];
  recentReceipts: ReceiptRow[];
};

const tabs = ["Overview", "Movements", "BOM Usage"] as const;
type Tab = (typeof tabs)[number];

export default function DetailTabs({ stats, movements, bomUsage, recentReceipts }: Props) {
  const [active, setActive] = useState<Tab>("Overview");

  return (
    <div className={styles.tabsContainer}>
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`}
            onClick={() => setActive(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === "Overview" && (
        <div className={styles.overviewContent}>
          <div className={styles.statsGrid}>
            {stats.map((s) => (
              <div
                key={s.label}
                className={`${styles.statCard} ${
                    s.highlight === "danger"
                      ? styles.statCardHighlight
                      : s.highlight === "warning"
                      ? styles.statCardHighlightWarning
                      : ""
                  }`}
              >
                <span className={styles.statLabel}>{s.label}</span>
                <span
                  className={`${styles.statValue} ${
                    s.color === "green"
                      ? styles.statGreen
                      : s.color === "red"
                      ? styles.statRed
                      : s.color === "orange"
                      ? styles.statOrange
                      : s.color === "blue"
                      ? styles.statBlue
                      : ""
                  }`}
                >
                  {s.value}
                </span>
                {s.subText && (
                  <span
                    className={`${styles.statSub} ${s.subTextDanger ? styles.statSubDanger : ""}`}
                  >
                    {s.subText}
                  </span>
                )}
              </div>
            ))}
          </div>

          {recentReceipts.length > 0 && (
            <div className={styles.recentReceipts}>
              <div className={styles.recentTitle}>Recent receipts</div>
              <div className={styles.miniTable}>
                <div className={`${styles.miniHeader} ${styles.receiptCols}`}>
                  <span>Date</span>
                  <span>Supplier</span>
                  <span>Docket</span>
                  <span>Qty received</span>
                </div>
                {recentReceipts.map((r, i) => (
                  <div key={i} className={`${styles.miniRow} ${styles.receiptCols}`}>
                    <span>{r.date}</span>
                    <span>{r.supplierName}</span>
                    <span className={styles.refCell}>{r.reference}</span>
                    <span className={styles.positive}>+{r.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {active === "Movements" && (
        <div className={styles.tabContent}>
          {movements.length === 0 ? (
            <p className={styles.empty}>No inventory movements recorded.</p>
          ) : (
            <div className={styles.miniTable}>
              <div className={`${styles.miniHeader} ${styles.movementCols}`}>
                <span>Date</span>
                <span>On Hand</span>
                <span>In Prod</span>
                <span>Reason</span>
                <span>Ref</span>
              </div>
              {movements.map((m) => (
                <div key={m.id} className={`${styles.miniRow} ${styles.movementCols}`}>
                  <span>{m.date}</span>
                  <span className={m.deltaOnHand > 0 ? styles.positive : m.deltaOnHand < 0 ? styles.negative : ""}>
                    {m.deltaOnHand > 0 ? "+" : ""}{m.deltaOnHand}
                  </span>
                  <span className={m.deltaInProd > 0 ? styles.positive : m.deltaInProd < 0 ? styles.negative : ""}>
                    {m.deltaInProd > 0 ? "+" : ""}{m.deltaInProd}
                  </span>
                  <span>{m.reason}</span>
                  <span className={styles.refCell}>{m.refType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {active === "BOM Usage" && (
        <div className={styles.tabContent}>
          {bomUsage.length === 0 ? (
            <p className={styles.empty}>Not used in any BOMs.</p>
          ) : (
            <>
              <p className={styles.bomIntro}>
                This component is specified in{" "}
                <strong>
                  {bomUsage.length} bill{bomUsage.length !== 1 ? "s" : ""} of material
                </strong>
                . Any product using these BOMs requires it to manufacture.
              </p>
              <div className={styles.miniTable}>
                <div className={`${styles.miniHeader} ${styles.bomTableCols}`}>
                  <span>BOM / Product</span>
                  <span>Qty per unit</span>
                  <span>Status</span>
                </div>
                {bomUsage.map((row) => (
                  <div key={row.bomId} className={`${styles.miniRow} ${styles.bomTableCols}`}>
                    <span>
                      <a href="/app/bom" className={styles.bomLink}>
                        {row.product}
                        {row.variant && row.variant !== "--" ? ` — ${row.variant}` : ""}
                      </a>
                      {row.version > 0 && (
                        <span className={styles.bomVersion}> v{row.version}</span>
                      )}
                    </span>
                    <span className={styles.bomQty}>{row.quantity}</span>
                    <span>
                      <span className={row.active ? styles.badge : styles.badgeMuted}>
                        {row.active ? "Active" : "Draft"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
