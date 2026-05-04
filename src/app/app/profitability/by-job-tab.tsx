"use client";

import { useState } from "react";
import styles from "./profitability.module.css";

export type JobRow = {
  id: string;
  order_line_id: string;
  variant_id: string;
  order_number: string;
  product_title: string;
  variant_title: string;
  quantity: number;
  sell_price: number;
  planned_material_cost: number;
  planned_labor_cost: number;
  planned_overhead_cost: number;
  planned_total_cost: number;
  planned_margin: number;
  planned_margin_pct: number;
  actual_material_cost: number | null;
  actual_labor_cost: number | null;
  actual_overhead_cost: number | null;
  actual_total_cost: number | null;
  actual_margin: number | null;
  actual_margin_pct: number | null;
};

type Props = {
  jobs: JobRow[];
  variantFilter: string | null;
};

function fmt(value: number) {
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

function isActual(job: JobRow) {
  return job.actual_total_cost !== null && job.actual_total_cost > 0;
}

export default function ByJobTab({ jobs, variantFilter }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = variantFilter
    ? jobs.filter((j) => j.variant_id === variantFilter)
    : jobs;

  if (filtered.length === 0) {
    return (
      <div className={styles.profitTable}>
        <p className={styles.emptyState}>
          No jobs with cost snapshots yet. Generate financial plans from the
          Costing page first.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.profitTable}>
      <div className={styles.jobHeader}>
        <span>Order #</span>
        <span>Product / Variant</span>
        <span>Qty</span>
        <span>Sell Price</span>
        <span>Cost</span>
        <span>Margin $</span>
        <span>Margin %</span>
        <span>Status</span>
      </div>
      {filtered.map((job) => {
        const actual = isActual(job);
        const cost = actual ? job.actual_total_cost! : job.planned_total_cost;
        const margin = actual ? job.actual_margin! : job.planned_margin;
        const marginPct = actual ? job.actual_margin_pct! : job.planned_margin_pct;
        const isExpanded = expandedId === job.id;

        return (
          <div key={job.id}>
            <div
              className={styles.jobRow}
              onClick={() => setExpandedId(isExpanded ? null : job.id)}
            >
              <span>{job.order_number}</span>
              <span>
                <strong>{job.product_title}</strong>
                {job.variant_title && job.variant_title !== "—" && (
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.84rem",
                      color: "var(--ink-muted)",
                    }}
                  >
                    {job.variant_title}
                  </span>
                )}
              </span>
              <span>{job.quantity}</span>
              <span>{fmt(job.sell_price)}</span>
              <span>{fmt(cost)}</span>
              <span
                style={{
                  color: margin < 0 ? "#ff9472" : "var(--ink-strong)",
                }}
              >
                {fmt(margin)}
              </span>
              <span
                style={{
                  color: marginPct < 0 ? "#ff9472" : "var(--ink-strong)",
                }}
              >
                {fmtPct(marginPct)}
              </span>
              <span>
                <span
                  className={`${styles.badge} ${
                    actual ? styles.badgeActual : styles.badgePlanned
                  }`}
                >
                  {actual ? "Actual" : "Planned"}
                </span>
              </span>
            </div>

            {isExpanded && (
              <div className={styles.breakdown}>
                <div className={styles.breakdownGrid}>
                  <span className={styles.breakdownLabel}></span>
                  <span className={styles.breakdownLabel}>Planned</span>
                  {actual && (
                    <span className={styles.breakdownLabel}>Actual</span>
                  )}

                  <span>Materials</span>
                  <span>{fmt(job.planned_material_cost)}</span>
                  {actual && (
                    <span>
                      {fmt(job.actual_material_cost!)}
                      <sup title="Actual material tracking coming soon">*</sup>
                    </span>
                  )}

                  <span>Labor</span>
                  <span>{fmt(job.planned_labor_cost)}</span>
                  {actual && <span>{fmt(job.actual_labor_cost!)}</span>}

                  <span>Overhead</span>
                  <span>{fmt(job.planned_overhead_cost)}</span>
                  {actual && <span>{fmt(job.actual_overhead_cost!)}</span>}

                  <div className={styles.breakdownDivider} />

                  <span>Total cost</span>
                  <span>{fmt(job.planned_total_cost)}</span>
                  {actual && <span>{fmt(job.actual_total_cost!)}</span>}

                  <span>Sell price</span>
                  <span>{fmt(job.sell_price)}</span>
                  {actual && <span>{fmt(job.sell_price)}</span>}

                  <span>
                    <strong>Margin</strong>
                  </span>
                  <span>
                    <strong>
                      {fmt(job.planned_margin)} ({fmtPct(job.planned_margin_pct)})
                    </strong>
                  </span>
                  {actual && (
                    <span>
                      <strong>
                        {fmt(job.actual_margin!)} ({fmtPct(job.actual_margin_pct)})
                      </strong>
                    </span>
                  )}
                </div>
                {actual && (
                  <p className={styles.asteriskNote}>
                    * Actual material cost equals planned for now — actual
                    material usage tracking coming soon.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
