"use client";

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

export default function ByProductTab({ products, onVariantClick }: Props) {
  void onVariantClick; // used in Task 4
  if (products.length === 0) {
    return (
      <p style={{ color: "var(--ink-muted)", padding: "24px 0" }}>
        No product profitability data yet.
      </p>
    );
  }
  return (
    <p style={{ color: "var(--ink-muted)" }}>
      {products.length} product{products.length !== 1 ? "s" : ""} — full
      table implemented in Task 4.
    </p>
  );
}
