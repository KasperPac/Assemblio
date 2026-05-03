import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  loadInventoryIntegrityAudit,
  type AuditClient,
} from "@/lib/inventory/audit";
import styles from "./reports.module.css";

type SnapshotRow = {
  sell_price: number;
  planned_total_cost: number;
  planned_margin: number;
};

type ActualRollupRow = {
  actual_total_cost: number;
  actual_margin: number;
  actual_hours_total: number;
  order_line: { line_sell_price: number } | { line_sell_price: number }[] | null;
};

type UtilizationRow = {
  overload_hours: number;
  idle_hours: number;
  utilization_pct: number;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient();
  const tenantContext = await getServerTenantContext();
  const integrity = tenantContext
    ? await loadInventoryIntegrityAudit(
        tenantContext.supabase as unknown as AuditClient,
        tenantContext.tenantId
      )
    : {
        invariantIssues: [],
        reconciliationIssues: [],
        duplicateAllocationKeys: [],
        poOverReceipt: [],
      };

  const integrityCards = [
    {
      title: "Invariant issues",
      value: integrity.invariantIssues.length,
      copy:
        integrity.invariantIssues.length === 0
          ? "All balances satisfy on_hand >= reserved and non-negative invariants."
          : `${integrity.invariantIssues.length} balance row${integrity.invariantIssues.length === 1 ? "" : "s"} violate inventory invariants.`,
    },
    {
      title: "Reconciliation drift",
      value: integrity.reconciliationIssues.length,
      copy:
        integrity.reconciliationIssues.length === 0
          ? "Movement deltas reconcile to current balances."
          : `${integrity.reconciliationIssues.length} balance row${integrity.reconciliationIssues.length === 1 ? "" : "s"} drift from the movement ledger.`,
    },
    {
      title: "Duplicate allocations",
      value: integrity.duplicateAllocationKeys.length,
      copy:
        integrity.duplicateAllocationKeys.length === 0
          ? "Every (order_line, component) pair is unique."
          : `${integrity.duplicateAllocationKeys.length} duplicate allocation key${integrity.duplicateAllocationKeys.length === 1 ? "" : "s"} found.`,
    },
    {
      title: "PO over-receipts",
      value: integrity.poOverReceipt.length,
      copy:
        integrity.poOverReceipt.length === 0
          ? "No purchase order line is over its ordered quantity."
          : `${integrity.poOverReceipt.length} purchase order line${integrity.poOverReceipt.length === 1 ? "" : "s"} over-received.`,
    },
  ];

  const totalIntegrityIssues = integrityCards.reduce(
    (sum, card) => sum + card.value,
    0
  );

  const [{ data: planned }, { data: actual }, { data: utilization }] =
    await Promise.all([
      supabase
        .from("job_cost_snapshot")
        .select("sell_price,planned_total_cost,planned_margin")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("job_cost_actual_rollup")
        .select("actual_total_cost,actual_margin,actual_hours_total,order_line:order_line_id(line_sell_price)")
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("department_utilization_week")
        .select("overload_hours,idle_hours,utilization_pct")
        .order("updated_at", { ascending: false })
        .limit(20),
  ]);

  const plannedRows = (planned ?? []) as SnapshotRow[];
  const actualRows = (actual ?? []) as ActualRollupRow[];
  const utilizationRows = (utilization ?? []) as UtilizationRow[];

  const plannedRevenue = plannedRows.reduce(
    (sum, row) => sum + Number(row.sell_price ?? 0),
    0
  );
  const plannedMargin = plannedRows.reduce(
    (sum, row) => sum + Number(row.planned_margin ?? 0),
    0
  );
  const actualRevenue = actualRows.reduce((sum, row) => {
    const orderLine = firstRelation(row.order_line);
    return sum + Number(orderLine?.line_sell_price ?? 0);
  }, 0);
  const actualMargin = actualRows.reduce(
    (sum, row) => sum + Number(row.actual_margin ?? 0),
    0
  );
  const actualHours = actualRows.reduce(
    (sum, row) => sum + Number(row.actual_hours_total ?? 0),
    0
  );
  const overloadedDepartments = utilizationRows.filter(
    (row) => Number(row.overload_hours ?? 0) > 0
  ).length;
  const averageUtilization =
    utilizationRows.length === 0
      ? 0
      : utilizationRows.reduce(
          (sum, row) => sum + Number(row.utilization_pct ?? 0),
          0
        ) / utilizationRows.length;

  const reportCards = [
    {
      title: "Executive Margin",
      value: formatCurrency(plannedMargin),
      copy: `Planned revenue ${formatCurrency(plannedRevenue)} across ${plannedRows.length} cost snapshots.`,
    },
    {
      title: "Actual Margin",
      value: formatCurrency(actualMargin),
      copy: `Actual revenue ${formatCurrency(actualRevenue)} with ${actualRows.length} actual rollups posted.`,
    },
    {
      title: "Operations Capacity",
      value: `${overloadedDepartments}`,
      copy: "Departments currently overloaded in the latest utilization rows.",
    },
    {
      title: "Labor Utilization",
      value: `${Math.round(averageUtilization * 100)}%`,
      copy: `${actualHours} actual labor hours have been booked so far.`,
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Reports</h1>
          <p>Live financial, actuals, and capacity reporting from Supabase</p>
        </div>
      </div>

      <div className={styles.grid}>
        {reportCards.map((card) => (
          <div key={card.title} className={styles.card}>
            <h3>{card.title}</h3>
            <strong className={styles.value}>{card.value}</strong>
            <p>{card.copy}</p>
          </div>
        ))}
      </div>

      <section className={styles.integritySection}>
        <header className={styles.integrityHeader}>
          <div>
            <p className={styles.eyebrow}>Inventory integrity</p>
            <h2 className={styles.integrityTitle}>
              {totalIntegrityIssues === 0
                ? "Inventory controls are healthy"
                : `${totalIntegrityIssues} integrity issue${totalIntegrityIssues === 1 ? "" : "s"} need review`}
            </h2>
          </div>
          <span
            className={`${styles.integrityPill} ${
              totalIntegrityIssues === 0 ? styles.pillOk : styles.pillWarn
            }`}
          >
            {totalIntegrityIssues === 0 ? "Healthy" : `${totalIntegrityIssues} open`}
          </span>
        </header>
        <div className={styles.grid}>
          {integrityCards.map((card) => (
            <div key={card.title} className={styles.card}>
              <h3>{card.title}</h3>
              <strong className={styles.value}>{card.value}</strong>
              <p>{card.copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.table}>
        <h3>Reporting model</h3>
        <div className={styles.tableRows}>
          <div className={styles.tableRow}>
            <strong>Planned profitability</strong>
            <span>
              {plannedRows.length === 0
                ? "No cost snapshots yet."
                : `${plannedRows.length} planned job snapshots loaded.`}
            </span>
          </div>
          <div className={styles.tableRow}>
            <strong>Actual cost rollups</strong>
            <span>
              {actualRows.length === 0
                ? "No actual rollups yet."
                : `${actualRows.length} jobs have actual margin visibility.`}
            </span>
          </div>
          <div className={styles.tableRow}>
            <strong>Capacity pressure</strong>
            <span>
              {overloadedDepartments === 0
                ? "No overloads detected in current capacity rows."
                : `${overloadedDepartments} department row(s) are over capacity.`}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
