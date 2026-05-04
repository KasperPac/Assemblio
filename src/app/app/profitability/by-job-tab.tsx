"use client";

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

export default function ByJobTab({ jobs, variantFilter }: Props) {
  const filtered = variantFilter
    ? jobs.filter((j) => j.variant_id === variantFilter)
    : jobs;
  if (filtered.length === 0) {
    return (
      <p style={{ color: "var(--ink-muted)", padding: "24px 0" }}>
        No jobs with cost snapshots yet. Generate financial plans from the
        Costing page first.
      </p>
    );
  }
  return (
    <p style={{ color: "var(--ink-muted)" }}>
      {filtered.length} job{filtered.length !== 1 ? "s" : ""} — full
      table implemented in Task 3.
    </p>
  );
}
