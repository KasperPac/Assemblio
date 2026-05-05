import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  allocateAndPlanOrder,
  allocateOrder,
  planOrder,
  updateJobLaborPlanWeek,
} from "../actions";
import { getWeekStart } from "@/lib/dates";
import PageHeader from "../../_ui/page-header";
import StatusBadge from "../../_ui/status-badge";
import EmptyState from "../../_ui/empty-state";
import styles from "./page.module.css";

type OrderRecord = {
  id: string;
  shopify_order_id: string | null;
  order_number: string | null;
  status: string;
  created_at: string;
};

type OrderLineRecord = {
  id: string;
  quantity: number;
  unit_sell_price: number;
  line_sell_price: number;
  variant:
    | {
        title: string | null;
        sku: string | null;
        product:
          | {
              title: string | null;
            }
          | {
              title: string | null;
            }[]
          | null;
      }
    | {
        title: string | null;
        sku: string | null;
        product:
          | {
              title: string | null;
            }
          | {
              title: string | null;
            }[]
          | null;
      }[]
    | null;
};

type PlannedSnapshot = {
  order_line_id: string | null;
  planned_total_cost: number;
  planned_margin: number;
  planned_margin_pct: number;
};

type ActualRollup = {
  order_line_id: string;
  actual_total_cost: number;
  actual_margin: number;
  actual_margin_pct: number;
  actual_hours_total: number;
};

type AllocationRow = {
  order_line_id: string;
  quantity: number;
};

type LaborPlanRow = {
  id: string;
  order_line_id: string;
  department_id: string;
  operation_name: string;
  week_start: string;
  sequence: number;
  planned_total_hours: number;
  department:
    | {
        name: string | null;
        code: string | null;
      }
    | Array<{
        name: string | null;
        code: string | null;
      }>
    | null;
};

type UtilizationRow = {
  department_id: string;
  week_start: string;
  overload_hours: number;
  idle_hours: number;
  utilization_pct: number;
};

type Props = {
  params: Promise<{
    orderId: string;
  }>;
  searchParams?: Promise<{
    allocated?: string;
    planned?: string;
    planError?: string;
    week?: string;
  }>;
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

function getStatusVariant(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "fulfilled") return "success";
  if (normalized === "cancelled") return "danger";
  if (normalized === "in_progress" || normalized === "allocated") return "info";
  return "warning";
}

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const { orderId } = await params;
  const query = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const selectedWeek = query.week ?? getWeekStart();

  const [{ data: order }, { data: orderLines }] = await Promise.all([
    supabase
      .from("orders")
      .select("id,shopify_order_id,order_number,status,created_at")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_line")
      .select(
        "id,quantity,unit_sell_price,line_sell_price,variant:variant_id(title,sku,product:product_id(title))"
      )
      .eq("order_id", orderId),
  ]);

  const orderLineIds = ((orderLines ?? []) as Array<{ id: string }>).map(
    (line) => line.id
  );

  const [
    { data: plannedSnapshots },
    { data: actualRollups },
    { data: allocations },
    { data: laborPlans },
    { data: utilizationRows },
  ] = await Promise.all([
    supabase
      .from("job_cost_snapshot")
      .select("order_line_id,planned_total_cost,planned_margin,planned_margin_pct")
      .eq("order_id", orderId),
    supabase
      .from("job_cost_actual_rollup")
      .select(
        "order_line_id,actual_total_cost,actual_margin,actual_margin_pct,actual_hours_total"
      )
      .eq("order_id", orderId),
    orderLineIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("order_component_allocation")
          .select("order_line_id,quantity")
          .in("order_line_id", orderLineIds),
    supabase
      .from("job_labor_plan")
      .select(
        "id,order_line_id,department_id,operation_name,week_start,sequence,planned_total_hours,department:department_id(name,code)"
      )
      .eq("order_id", orderId),
    supabase
      .from("department_utilization_week")
      .select("department_id,week_start,overload_hours,idle_hours,utilization_pct"),
  ]);

  if (!order) {
    notFound();
  }

  const typedOrder = order as OrderRecord;
  const typedLines = (orderLines ?? []) as OrderLineRecord[];
  const plannedByLine = new Map(
    ((plannedSnapshots ?? []) as PlannedSnapshot[]).map((row) => [
      row.order_line_id ?? "",
      row,
    ])
  );
  const actualByLine = new Map(
    ((actualRollups ?? []) as ActualRollup[]).map((row) => [row.order_line_id, row])
  );
  const allocationByLine = ((allocations ?? []) as AllocationRow[]).reduce<
    Record<string, number>
  >((acc, row) => {
    acc[row.order_line_id] = (acc[row.order_line_id] ?? 0) + Number(row.quantity ?? 0);
    return acc;
  }, {});
  const laborByLine = ((laborPlans ?? []) as LaborPlanRow[]).reduce<
    Record<string, number>
  >((acc, row) => {
    acc[row.order_line_id] = (acc[row.order_line_id] ?? 0) + Number(row.planned_total_hours ?? 0);
    return acc;
  }, {});
  const laborPlansByLine = ((laborPlans ?? []) as LaborPlanRow[]).reduce<
    Record<string, LaborPlanRow[]>
  >((acc, row) => {
    const bucket = acc[row.order_line_id] ?? [];
    bucket.push(row);
    acc[row.order_line_id] = bucket;
    return acc;
  }, {});
  const utilizationMap = new Map(
    ((utilizationRows ?? []) as UtilizationRow[]).map((row) => [
      `${row.department_id}:${row.week_start}`,
      row,
    ])
  );
  const overloadWarnings = ((laborPlans ?? []) as LaborPlanRow[])
    .map((plan) => {
      const department = firstRelation(plan.department);
      const utilization = utilizationMap.get(`${plan.department_id}:${plan.week_start}`);
      const overloadHours = Number(utilization?.overload_hours ?? 0);
      if (overloadHours <= 0) {
        return null;
      }

      return {
        key: `${plan.department_id}:${plan.week_start}`,
        departmentName: department?.name ?? "Department",
        weekStart: plan.week_start,
        overloadHours,
      };
    })
    .filter((warning): warning is NonNullable<typeof warning> => Boolean(warning))
    .reduce<
      Record<string, { departmentName: string; weekStart: string; overloadHours: number }>
    >((acc, warning) => {
      const current = acc[warning.key];
      if (!current || current.overloadHours < warning.overloadHours) {
        acc[warning.key] = {
          departmentName: warning.departmentName,
          weekStart: warning.weekStart,
          overloadHours: warning.overloadHours,
        };
      }
      return acc;
    }, {});
  const overloadSummary = Object.values(overloadWarnings).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  );

  const totals = typedLines.reduce(
    (acc, line) => {
      const planned = plannedByLine.get(line.id);
      const actual = actualByLine.get(line.id);
      acc.sell += Number(line.line_sell_price ?? 0);
      acc.planned += Number(planned?.planned_total_cost ?? 0);
      acc.plannedMargin += Number(planned?.planned_margin ?? 0);
      acc.actual += Number(actual?.actual_total_cost ?? 0);
      acc.actualMargin += Number(actual?.actual_margin ?? 0);
      acc.hours += Number(actual?.actual_hours_total ?? 0);
      return acc;
    },
    { sell: 0, planned: 0, plannedMargin: 0, actual: 0, actualMargin: 0, hours: 0 }
  );

  const allocatedLineCount = typedLines.filter((line) => (allocationByLine[line.id] ?? 0) > 0).length;
  const plannedLineCount = typedLines.filter((line) => plannedByLine.has(line.id)).length;
  const statusVariant = getStatusVariant(typedOrder.status);

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link href="/app/orders" className={styles.backButton}>
          {"<- Back to orders"}
        </Link>
        <p className={styles.breadcrumb}>
          <Link href="/app/orders">Orders</Link> &gt;{" "}
          <span>
            #{typedOrder.order_number ?? typedOrder.shopify_order_id ?? typedOrder.id.slice(0, 6)}
          </span>
        </p>
      </div>

      <PageHeader
        eyebrow="Order workflow"
        title={`Order #${typedOrder.order_number ?? typedOrder.shopify_order_id ?? typedOrder.id.slice(0, 6)}`}
        description={`Shopify ${typedOrder.shopify_order_id ?? "--"} • Created ${new Date(
          typedOrder.created_at
        ).toLocaleDateString("en-GB")}`}
        actions={
          <div className={styles.headerActions}>
            <StatusBadge variant={statusVariant}>{typedOrder.status}</StatusBadge>
            <form action={allocateOrder}>
              <input type="hidden" name="order_id" value={typedOrder.id} />
              <input type="hidden" name="return_to" value={`/app/orders/${typedOrder.id}`} />
              <input
                type="hidden"
                name="idempotency_key"
                value={crypto.randomUUID()}
              />
              <button className={styles.secondary} type="submit">
                Run allocation
              </button>
            </form>
          </div>
        }
      />

      {query.allocated ? (
        <p className={styles.successMeta}>Allocation updated for this order.</p>
      ) : null}
      {query.planned ? (
        <p className={styles.successMeta}>
          {query.planned === "updated"
            ? "Updated labor plan week assignment."
            : `Generated plans for ${query.planned} order lines from ${selectedWeek}.`}
        </p>
      ) : null}
      {query.planError ? (
        <p className={styles.errorMeta}>Plan generation failed: {query.planError}</p>
      ) : null}

      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span>Order value</span>
              <strong>{formatCurrency(totals.sell)}</strong>
              <p>{typedLines.length} line{typedLines.length === 1 ? "" : "s"} in this order</p>
            </div>
            <div className={styles.summaryCard}>
              <span>Allocated lines</span>
              <strong>{allocatedLineCount}</strong>
              <p>
                {typedLines.length === 0
                  ? "No lines available"
                  : `${typedLines.length - allocatedLineCount} still need allocation review`}
              </p>
            </div>
            <div className={styles.summaryCard}>
              <span>Planned margin</span>
              <strong>{formatCurrency(totals.plannedMargin)}</strong>
              <p>{plannedLineCount} line{plannedLineCount === 1 ? "" : "s"} have a cost snapshot</p>
            </div>
            <div className={styles.summaryCard}>
              <span>Actual hours</span>
              <strong>{totals.hours.toFixed(1)}</strong>
              <p>{formatCurrency(totals.actualMargin)} actual margin recorded</p>
            </div>
          </div>
        </div>

        <aside className={styles.planningPanel}>
          <div className={styles.planningIntro}>
            <p className={styles.eyebrow}>Planning controls</p>
            <h2>Allocate first, then place labor into a viable week</h2>
            <p className={styles.meta}>
              Keep component reservations and labor capacity aligned before work hits the floor.
            </p>
          </div>
          <form className={styles.planningForm}>
            <input type="hidden" name="order_id" value={typedOrder.id} />
            <input type="hidden" name="return_to" value={`/app/orders/${typedOrder.id}`} />
            <label className={styles.weekPicker}>
              <span>Plan from week</span>
              <input name="week_start" type="date" defaultValue={selectedWeek} />
            </label>
            <div className={styles.actionButtons}>
              <button className={styles.secondary} formAction={planOrder} type="submit">
                Generate plans
              </button>
              <button className={styles.primary} formAction={allocateAndPlanOrder} type="submit">
                Allocate and plan
              </button>
            </div>
          </form>
        </aside>
      </section>

      {overloadSummary.length > 0 ? (
        <section className={styles.warningPanel}>
          <div className={styles.warningHeader}>
            <div>
              <p className={styles.eyebrow}>Capacity risks</p>
              <h2>Department weeks already over capacity</h2>
            </div>
            <StatusBadge variant="danger">{overloadSummary.length} conflict{overloadSummary.length === 1 ? "" : "s"}</StatusBadge>
          </div>
          <div className={styles.warningList}>
            {overloadSummary.map((warning) => (
              <div key={`${warning.departmentName}-${warning.weekStart}`} className={styles.warningCard}>
                <strong>{warning.departmentName}</strong>
                <p>Week of {warning.weekStart}</p>
                <span>{warning.overloadHours.toFixed(1)} hrs over capacity</span>
                <Link href={`/app/staffing?week=${warning.weekStart}`} className={styles.warningLink}>
                  Adjust staffing week
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.linesSection}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Line planning</p>
            <h2>Allocate material and place each operation</h2>
          </div>
        </div>

        {typedLines.length === 0 ? (
          <EmptyState
            title="No order lines found"
            message="This order has no synced line items yet, so there is nothing to allocate or schedule."
          />
        ) : (
          <div className={styles.lineList}>
            {typedLines.map((line) => {
              const variant = firstRelation(line.variant);
              const product = firstRelation(variant?.product);
              const planned = plannedByLine.get(line.id);
              const actual = actualByLine.get(line.id);
              const allocatedQty = allocationByLine[line.id] ?? 0;
              const plannedHours = laborByLine[line.id] ?? 0;
              const lineLaborPlans = laborPlansByLine[line.id] ?? [];
              const lineStatus =
                allocatedQty > 0 && planned
                  ? "Ready"
                  : allocatedQty > 0
                  ? "Allocated"
                  : "Needs work";

              return (
                <article key={line.id} className={styles.lineCard}>
                  <div className={styles.lineSummary}>
                    <div className={styles.lineIdentity}>
                      <div className={styles.lineHeading}>
                        <h3>{product?.title ?? variant?.title ?? "Variant"}</h3>
                        <StatusBadge
                          variant={
                            lineStatus === "Ready"
                              ? "success"
                              : lineStatus === "Allocated"
                              ? "info"
                              : "warning"
                          }
                        >
                          {lineStatus}
                        </StatusBadge>
                      </div>
                      <p className={styles.meta}>
                        {variant?.sku ?? "No SKU"} • Qty {line.quantity} • Unit {formatCurrency(line.unit_sell_price)}
                      </p>
                    </div>

                    <div className={styles.lineMetrics}>
                      <div className={styles.lineMetric}>
                        <span>Sell</span>
                        <strong>{formatCurrency(line.line_sell_price)}</strong>
                      </div>
                      <div className={styles.lineMetric}>
                        <span>Allocated</span>
                        <strong>{allocatedQty.toFixed(2)}</strong>
                      </div>
                      <div className={styles.lineMetric}>
                        <span>Planned cost</span>
                        <strong>
                          {planned ? formatCurrency(planned.planned_total_cost) : "--"}
                        </strong>
                      </div>
                      <div className={styles.lineMetric}>
                        <span>Planned hours</span>
                        <strong>{plannedHours.toFixed(1)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className={styles.lineFinanceStrip}>
                    <div className={styles.financeBlock}>
                      <span>Planned margin</span>
                      <strong>
                        {planned ? formatCurrency(planned.planned_margin) : "Awaiting snapshot"}
                      </strong>
                      <p>
                        {planned
                          ? `${planned.planned_margin_pct.toFixed(1)}% margin`
                          : "Generate a financial plan to lock planned cost and margin."}
                      </p>
                    </div>
                    <div className={styles.financeBlock}>
                      <span>Actual position</span>
                      <strong>
                        {actual ? formatCurrency(actual.actual_total_cost) : "No actuals"}
                      </strong>
                      <p>
                        {actual
                          ? `${formatCurrency(actual.actual_margin)} margin • ${actual.actual_hours_total.toFixed(1)} hrs`
                          : "Awaiting time or cost postings."}
                      </p>
                    </div>
                  </div>

                  <div className={styles.planSection}>
                    <div className={styles.planHeader}>
                      <div>
                        <h4>Labor schedule</h4>
                        <p className={styles.meta}>
                          {lineLaborPlans.length} operation{lineLaborPlans.length === 1 ? "" : "s"} linked to this order line
                        </p>
                      </div>
                    </div>

                    {lineLaborPlans.length === 0 ? (
                      <EmptyState
                        title="No labor operations planned yet"
                        message="Run planning for this order to place labor by department and week."
                      />
                    ) : (
                      <div className={styles.planList}>
                        {lineLaborPlans.map((plan) => {
                          const department = firstRelation(plan.department);
                          const utilization = utilizationMap.get(
                            `${plan.department_id}:${plan.week_start}`
                          );
                          const overload = Number(utilization?.overload_hours ?? 0);

                          return (
                            <form key={plan.id} action={updateJobLaborPlanWeek} className={styles.planRow}>
                              <input type="hidden" name="plan_id" value={plan.id} />
                              <input type="hidden" name="order_id" value={typedOrder.id} />
                              <input type="hidden" name="return_to" value={`/app/orders/${typedOrder.id}`} />
                              <div className={styles.planIdentity}>
                                <strong>{plan.operation_name}</strong>
                                <p className={styles.meta}>
                                  {department?.name ?? "Department"} • Seq {plan.sequence}
                                </p>
                              </div>
                              <div className={styles.planMeta}>
                                <div className={styles.planMetaItem}>
                                  <span>Hours</span>
                                  <strong>{plan.planned_total_hours.toFixed(1)}</strong>
                                </div>
                                <div className={styles.planMetaItem}>
                                  <span>Capacity</span>
                                  <strong className={overload > 0 ? styles.capacityDanger : styles.capacitySafe}>
                                    {overload > 0
                                      ? `Over by ${overload.toFixed(1)} hrs`
                                      : `Spare ${Number(utilization?.idle_hours ?? 0).toFixed(1)} hrs`}
                                  </strong>
                                </div>
                              </div>
                              <div className={styles.weekField}>
                                <label>
                                  <span>Week</span>
                                  <input name="week_start" type="date" defaultValue={plan.week_start} />
                                </label>
                                <button className={styles.secondary} type="submit">
                                  Move week
                                </button>
                              </div>
                            </form>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
