import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../planning.module.css";
import ProfitabilityTabs from "./profitability-tabs";
import { resyncOrderPrices } from "./actions";
import type { JobRow } from "./by-job-tab";
import type { ProductRow } from "./by-product-tab";

type SnapshotQueryRow = {
  id: string;
  order_line_id: string | null;
  sell_price: number;
  planned_material_cost: number;
  planned_labor_cost: number;
  planned_admin_cost: number;
  planned_electricity_cost: number;
  planned_gas_cost: number;
  planned_overhead_cost: number;
  planned_total_cost: number;
  planned_margin: number;
  planned_margin_pct: number;
  order_line:
    | {
        id: string;
        quantity: number;
        variant_id: string;
        order: { order_number: string | null } | { order_number: string | null }[] | null;
        variant:
          | {
              title: string | null;
              product: { title: string | null } | { title: string | null }[] | null;
            }
          | {
              title: string | null;
              product: { title: string | null } | { title: string | null }[] | null;
            }[]
          | null;
      }
    | {
        id: string;
        quantity: number;
        variant_id: string;
        order: { order_number: string | null } | { order_number: string | null }[] | null;
        variant:
          | {
              title: string | null;
              product: { title: string | null } | { title: string | null }[] | null;
            }
          | {
              title: string | null;
              product: { title: string | null } | { title: string | null }[] | null;
            }[]
          | null;
      }[]
    | null;
};

type ActualQueryRow = {
  order_line_id: string;
  actual_material_cost: number;
  actual_labor_cost: number;
  actual_admin_cost: number;
  actual_electricity_cost: number;
  actual_gas_cost: number;
  actual_overhead_cost: number;
  actual_total_cost: number;
  actual_margin: number;
  actual_margin_pct: number;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function ProfitabilityPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: snapshots }, { data: actuals }, { data: products }] =
    await Promise.all([
      supabase
        .from("job_cost_snapshot")
        .select(
          `id, order_line_id, sell_price,
           planned_material_cost, planned_labor_cost,
           planned_admin_cost, planned_electricity_cost,
           planned_gas_cost, planned_overhead_cost,
           planned_total_cost, planned_margin, planned_margin_pct,
           order_line:order_line_id(
             id, quantity, variant_id,
             order:order_id(order_number),
             variant:variant_id(title, product:product_id(title))
           )`
        )
        .order("planned_margin_pct", { ascending: true }),
      supabase
        .from("job_cost_actual_rollup")
        .select(
          `order_line_id,
           actual_material_cost, actual_labor_cost,
           actual_admin_cost, actual_electricity_cost,
           actual_gas_cost, actual_overhead_cost,
           actual_total_cost, actual_margin, actual_margin_pct`
        ),
      supabase
        .from("product_profitability")
        .select("*")
        .order("avg_planned_margin_pct", { ascending: true }),
    ]);

  const actualMap = new Map(
    ((actuals ?? []) as ActualQueryRow[]).map((a) => [a.order_line_id, a])
  );

  const jobs: JobRow[] = ((snapshots ?? []) as SnapshotQueryRow[]).flatMap(
    (snap) => {
      const orderLine = firstRelation(snap.order_line);
      if (!orderLine) return [];
      const order = firstRelation(orderLine.order);
      const variant = firstRelation(orderLine.variant);
      const product = variant ? firstRelation(variant.product) : null;
      const actual = snap.order_line_id
        ? actualMap.get(snap.order_line_id)
        : null;
      const plannedOverhead =
        (snap.planned_admin_cost ?? 0) +
        (snap.planned_electricity_cost ?? 0) +
        (snap.planned_gas_cost ?? 0) +
        (snap.planned_overhead_cost ?? 0);
      const actualOverhead =
        actual !== null && actual !== undefined
          ? (actual.actual_admin_cost ?? 0) +
            (actual.actual_electricity_cost ?? 0) +
            (actual.actual_gas_cost ?? 0) +
            (actual.actual_overhead_cost ?? 0)
          : null;
      return [
        {
          id: snap.id,
          order_line_id: snap.order_line_id ?? "",
          variant_id: orderLine.variant_id,
          order_number: order?.order_number ?? "—",
          product_title: product?.title ?? "—",
          variant_title: variant?.title ?? "—",
          quantity: orderLine.quantity,
          sell_price: snap.sell_price,
          planned_material_cost: snap.planned_material_cost,
          planned_labor_cost: snap.planned_labor_cost,
          planned_overhead_cost: plannedOverhead,
          planned_total_cost: snap.planned_total_cost,
          planned_margin: snap.planned_margin,
          planned_margin_pct: snap.planned_margin_pct,
          actual_material_cost: actual?.actual_material_cost ?? null,
          actual_labor_cost: actual?.actual_labor_cost ?? null,
          actual_overhead_cost: actualOverhead,
          actual_total_cost: actual?.actual_total_cost ?? null,
          actual_margin: actual?.actual_margin ?? null,
          actual_margin_pct: actual?.actual_margin_pct ?? null,
        } satisfies JobRow,
      ];
    }
  );

  const productRows = (products ?? []) as ProductRow[];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Financial Analytics</span>
          <h1>Profitability</h1>
          <p>Job and product-level margin tracking.</p>
        </div>
        <form action={resyncOrderPrices}>
          <button className={styles.secondary} type="submit">
            Re-sync prices from Shopify
          </button>
        </form>
      </div>
      <ProfitabilityTabs jobs={jobs} products={productRows} />
    </div>
  );
}
