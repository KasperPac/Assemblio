"use client";

import styles from "./profitability.module.css";

export type ProductRow = {
  tenant_id: string;
  variant_id: string;
  variant_title: string | null;
  product_title: string | null;
  job_count: number;
  total_revenue: number | null;
  avg_planned_margin_pct: number | null;
  avg_actual_margin_pct: number | null;
  total_actual_margin: number | null;
};

type Props = {
  products: ProductRow[];
  onVariantClick: (variantId: string) => void;
};

function fmt(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPct(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

export default function ByProductTab({ products, onVariantClick }: Props) {
  if (products.length === 0) {
    return (
      <div className={styles.profitTable}>
        <p className={styles.emptyState}>
          No product profitability data yet. Ensure orders are synced and
          financial plans are generated from the Costing page.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.profitTable}>
      <div className={styles.productHeader}>
        <span>Product / Variant</span>
        <span>Jobs</span>
        <span>Total Revenue</span>
        <span>Avg Margin %</span>
        <span>Total Margin $</span>
      </div>
      {products.map((row) => {
        const displayPct =
          row.avg_actual_margin_pct ?? row.avg_planned_margin_pct;
        const isNegative = displayPct !== null && displayPct < 0;
        return (
          <div
            key={row.variant_id}
            className={styles.productRow}
            onClick={() => onVariantClick(row.variant_id)}
          >
            <span>
              <strong>{row.product_title ?? "—"}</strong>
              {row.variant_title && (
                <span
                  style={{
                    display: "block",
                    fontSize: "0.84rem",
                    color: "var(--ink-muted)",
                  }}
                >
                  {row.variant_title}
                </span>
              )}
            </span>
            <span>{row.job_count}</span>
            <span>{fmt(row.total_revenue)}</span>
            <span style={{ color: isNegative ? "#ff9472" : "var(--ink-strong)" }}>
              {fmtPct(displayPct)}
              {row.avg_actual_margin_pct === null && displayPct !== null && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--ink-faint)",
                    marginLeft: 4,
                  }}
                >
                  planned
                </span>
              )}
            </span>
            <span style={{ color: isNegative ? "#ff9472" : "var(--ink-strong)" }}>
              {fmt(row.total_actual_margin)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
