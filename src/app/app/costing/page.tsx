import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "../planning.module.css";
import { generateFinancialPlans } from "./actions";

type SnapshotRow = {
  id: string;
  order_line_id: string | null;
  snapshot_status: string;
  sell_price: number;
  planned_total_cost: number;
  planned_margin: number;
  planned_margin_pct: number;
  created_at: string;
  order_line:
    | {
        quantity: number;
        variant:
          | {
              id: string | null;
              title: string | null;
              sku: string | null;
            }
          | {
              id: string | null;
              title: string | null;
              sku: string | null;
            }[]
          | null;
      }
    | {
        quantity: number;
        variant:
          | {
              id: string | null;
              title: string | null;
              sku: string | null;
            }
          | {
              id: string | null;
              title: string | null;
              sku: string | null;
            }[]
          | null;
      }[]
    | null;
};

type ActualRollupRow = {
  order_line_id: string;
  actual_total_cost: number;
  actual_margin: number;
  actual_hours_total: number;
};

type Props = {
  searchParams?: Promise<{
    generated?: string;
    error?: string;
  }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function CostingPage({ searchParams }: Props) {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;
  const params = (await searchParams) ?? {};
  const [
    { count: openOrdersCount },
    { count: activeBomCount },
    { count: snapshotCount },
    { count: actualRollupCount },
    { data, error },
    { data: actualRollups },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("historical", false)
      .not("status", "in", '("fulfilled","cancelled")'),
    supabase
      .from("product_bom")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    supabase
      .from("job_cost_snapshot")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("job_cost_actual_rollup")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("job_cost_snapshot")
      .select(
        "id,order_line_id,snapshot_status,sell_price,planned_total_cost,planned_margin,planned_margin_pct,created_at,order_line:order_line_id(quantity,variant:variant_id(id,title,sku))"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("job_cost_actual_rollup")
      .select("order_line_id,actual_total_cost,actual_margin,actual_hours_total")
      .eq("tenant_id", tenantId),
  ]);

  const rows = (data ?? []) as SnapshotRow[];
  const actualMap = new Map(
    ((actualRollups ?? []) as ActualRollupRow[]).map((row) => [row.order_line_id, row])
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Profitability Engine</span>
          <p>
            Planned and actual job costing with frozen cost snapshots and
            margin visibility.
          </p>
        </div>
        <form action={generateFinancialPlans}>
          <button className={styles.primary} type="submit">
            Generate Plans
          </button>
        </form>
      </div>
      {params.generated ? (
        <div className={styles.callout}>
          <h3>Planning artifacts generated</h3>
          <p className={styles.muted}>
            Generated or refreshed plans for {params.generated} open order line
            {params.generated === "1" ? "" : "s"}.
          </p>
        </div>
      ) : null}
      {params.error ? (
        <div className={styles.callout}>
          <h3>Generation failed</h3>
          <p className={styles.muted}>{params.error}</p>
        </div>
      ) : null}

      <section className={styles.hero}>
        <div>
          <h2>Current rollout anchor</h2>
          <p className={styles.muted}>
            Every accepted job should carry a frozen cost snapshot so rate
            changes later do not rewrite history.
          </p>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Open Orders</span>
              <strong>{openOrdersCount ?? 0}</strong>
            </div>
            <div className={styles.metric}>
              <span>Active BOMs</span>
              <strong>{activeBomCount ?? 0}</strong>
            </div>
            <div className={styles.metric}>
              <span>Snapshots</span>
              <strong>{snapshotCount ?? 0}</strong>
            </div>
            <div className={styles.metric}>
              <span>Actual Rollups</span>
              <strong>{actualRollupCount ?? 0}</strong>
            </div>
          </div>
        </div>
        <div className={styles.callout}>
          <h3>Phase 1 model</h3>
          <p className={styles.muted}>
            Snapshot totals combine material, labor, admin, utilities, and
            overhead into a planned margin baseline before scheduling begins.
          </p>
        </div>
      </section>

      <section className={styles.table}>
        <h3>Recent cost snapshots</h3>
        <div className={styles.tableHeader}>
          <span>Job</span>
          <span>Planned</span>
          <span>Variance</span>
        </div>
        <div className={styles.tableRows}>
          {error ? (
            <div className={styles.stackRow}>Failed to load cost snapshots.</div>
          ) : rows.length === 0 ? (
            <div className={styles.stackRow}>
              No planned cost snapshots yet. Seed data or snapshot generation is
              required to populate this view.
            </div>
          ) : (
            rows.map((row) => {
              const orderLine = firstRelation(row.order_line);
              const variant = firstRelation(orderLine?.variant);
              const actual = row.order_line_id ? actualMap.get(row.order_line_id) : null;
              const variance = actual
                ? Number(actual.actual_total_cost ?? 0) - Number(row.planned_total_cost ?? 0)
                : null;

              return (
                <div key={row.id} className={styles.tableRow}>
                  <div>
                    {variant?.id ? (
                      <Link href={`/app/products/variants/${variant.id}`} className={styles.jobLink}>
                        <strong>{variant.title ?? variant.sku ?? row.snapshot_status}</strong>
                      </Link>
                    ) : (
                      <strong>{variant?.title ?? variant?.sku ?? row.snapshot_status}</strong>
                    )}
                    <div className={styles.subtle}>
                      Sell {formatCurrency(row.sell_price)} | Qty {orderLine?.quantity ?? 0}
                    </div>
                  </div>
                  <span>
                    {formatCurrency(row.planned_total_cost)}
                    <div className={styles.subtle}>
                      Margin {formatCurrency(row.planned_margin)}
                    </div>
                  </span>
                  <span className={`${styles.status} ${variance !== null && variance > 0 ? styles.warning : ""}`}>
                    {variance === null ? "Awaiting actuals" : formatCurrency(variance)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className={styles.table}>
        <h3>Planned vs actual</h3>
        <div className={styles.tableRows}>
          {rows.length === 0 ? (
            <div className={styles.stackRow}>No snapshots available yet.</div>
          ) : (
            rows.map((row) => {
              const orderLine = firstRelation(row.order_line);
              const variant = firstRelation(orderLine?.variant);
              const actual = row.order_line_id ? actualMap.get(row.order_line_id) : null;

              return (
                <div key={`${row.id}-variance`} className={styles.stackRow}>
                  {variant?.id ? (
                    <Link href={`/app/products/variants/${variant.id}`} className={styles.jobLink}>
                      <strong>{variant.title ?? variant.sku ?? "Job"}</strong>
                    </Link>
                  ) : (
                    <strong>{variant?.title ?? variant?.sku ?? "Job"}</strong>
                  )}
                  <div className={styles.subtle}>
                    Planned cost {formatCurrency(row.planned_total_cost)} | Planned margin{" "}
                    {formatCurrency(row.planned_margin)}
                  </div>
                  <div className={styles.subtle}>
                    {actual
                      ? `Actual cost ${formatCurrency(actual.actual_total_cost)} | Actual margin ${formatCurrency(actual.actual_margin)} | Hours ${actual.actual_hours_total}`
                      : "No actual cost rollup posted yet."}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
