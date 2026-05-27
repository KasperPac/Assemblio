import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { allocateOrder, updateJobLaborPlanWeek } from "../actions";
import { getOrderLineStatus } from "@/lib/orders/order-line-status";
import { getOrdersPipelineRollup } from "@/lib/orders/pipeline-rollup";
import { daysLate } from "@/lib/orders/target-ship";
import {
  ComponentsPill,
  ProductionPill,
  DeliveryPill,
} from "../_components/pipeline-pills";
import StatusBadge from "../../_ui/status-badge";
import EmptyState from "../../_ui/empty-state";
import styles from "./page.module.css";

type OrderRecord = {
  id: string;
  shopify_order_id: string | null;
  order_number: string | null;
  status: string;
  created_at: string;
  target_ship_date: string | null;
  source: string;
  customer_email: string | null;
};

type ProductData = {
  title: string | null;
  image_url: string | null;
  shopify_id: string | null;
};

type VariantData = {
  title: string | null;
  sku: string | null;
  shopify_id: string | null;
  product: ProductData | ProductData[] | null;
};

type OrderLineRecord = {
  id: string;
  quantity: number;
  unit_sell_price: number;
  line_sell_price: number;
  variant_id: string;
  variant: VariantData | VariantData[] | null;
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
  params: Promise<{ orderId: string }>;
  searchParams?: Promise<{
    allocated?: string;
    planError?: string;
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

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const { orderId } = await params;
  const query = (await searchParams) ?? {};
  const context = await getServerTenantContext();
  if (!context) notFound();
  const { supabase, tenantId } = context;

  const [{ data: order }, { data: orderLines }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id,shopify_order_id,order_number,status,created_at,target_ship_date,source,customer_email"
      )
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("order_line")
      .select(
        "id,quantity,unit_sell_price,line_sell_price,variant_id,variant:variant_id(title,sku,shopify_id,product:product_id(title,image_url,shopify_id))"
      )
      .eq("order_id", orderId)
      .eq("tenant_id", tenantId),
  ]);

  if (!order) notFound();

  const typedOrder = order as OrderRecord;
  const typedLines = (orderLines ?? []) as OrderLineRecord[];
  const lineRefs = typedLines.map((l) => ({
    id: l.id,
    variant_id: l.variant_id,
    quantity: l.quantity,
  }));

  const { role } = context;
  const showCosts = role === "admin" || role === "super_admin";

  const [
    lineStatusMap,
    { data: plannedSnapshots },
    { data: actualRollups },
    { data: laborPlans },
    { data: utilizationRows },
    { data: storeRow },
  ] = await Promise.all([
    getOrderLineStatus(supabase, tenantId, lineRefs),
    supabase
      .from("job_cost_snapshot")
      .select("order_line_id,planned_total_cost,planned_margin,planned_margin_pct")
      .eq("order_id", orderId),
    supabase
      .from("job_cost_actual_rollup")
      .select("order_line_id,actual_total_cost,actual_margin,actual_margin_pct,actual_hours_total")
      .eq("order_id", orderId),
    supabase
      .from("job_labor_plan")
      .select(
        "id,order_line_id,department_id,operation_name,week_start,sequence,planned_total_hours,department:department_id(name,code)"
      )
      .eq("order_id", orderId),
    supabase
      .from("department_utilization_week")
      .select("department_id,week_start,overload_hours,idle_hours,utilization_pct"),
    supabase
      .from("shopify_store")
      .select("store_domain")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rollupMap = await getOrdersPipelineRollup(supabase, tenantId, [
    {
      id: typedOrder.id,
      status: typedOrder.status,
      target_ship_date: typedOrder.target_ship_date ?? null,
    },
  ]);
  const rollup = rollupMap.get(typedOrder.id);

  const plannedByLine = new Map(
    ((plannedSnapshots ?? []) as PlannedSnapshot[]).map((row) => [
      row.order_line_id ?? "",
      row,
    ])
  );
  const actualByLine = new Map(
    ((actualRollups ?? []) as ActualRollup[]).map((row) => [row.order_line_id, row])
  );
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

  const allocatedLineCount = typedLines.filter(
    (line) => lineStatusMap.get(line.id)?.allocationState === "allocated"
  ).length;

  const plannedLineCount = typedLines.filter(
    (line) => plannedByLine.has(line.id)
  ).length;

  const totals = typedLines.reduce(
    (acc, line) => {
      const planned = plannedByLine.get(line.id);
      const actual = actualByLine.get(line.id);
      return {
        sell: acc.sell + Number(line.line_sell_price ?? 0),
        plannedMargin: acc.plannedMargin + Number(planned?.planned_margin ?? 0),
        actualMargin: acc.actualMargin + Number(actual?.actual_margin ?? 0),
        hours: acc.hours + (laborByLine[line.id] ?? 0),
      };
    },
    { sell: 0, plannedMargin: 0, actualMargin: 0, hours: 0 }
  );

  const shopDomain = (storeRow as { store_domain: string } | null)?.store_domain ?? null;

  function shopifyAdminUrl(type: "orders" | "products", gid: string | null): string | null {
    if (!shopDomain || !gid) return null;
    const numericId = gid.match(/\/(\d+)$/)?.[1];
    if (!numericId) return null;
    return `https://${shopDomain}/admin/${type}/${numericId}`;
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link href="/app/orders" className={styles.backButton}>
          {"← Back to orders"}
        </Link>
      </div>

      <div className={styles.detailHeader}>
        <div className={styles.headRow}>
          <div className={styles.headCell}>
            <div className={styles.headLabel}>Order</div>
            <h1 className={styles.headTitle}>
              {typedOrder.order_number ?? typedOrder.id.slice(0, 8)}
            </h1>
            <div className={styles.headSub}>
              Created {new Date(typedOrder.created_at).toLocaleDateString("en-AU")} ·{" "}
              {typedOrder.customer_email ?? "—"} ·{" "}
              {typedOrder.source === "shopify" ? "Shopify" : "B2B"}
            </div>
          </div>
          <div className={styles.headCell}>
            <div className={styles.headLabel}>Target ship</div>
            <div
              className={
                rollup?.isOverdue ? styles.headValueOverdue : styles.headValue
              }
            >
              {rollup?.targetShipDate
                ? rollup.targetShipDate.toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })
                : "—"}
              {rollup?.isOverdue && rollup.targetShipDate
                ? ` · ${daysLate(rollup.targetShipDate)}d late`
                : ""}
            </div>
          </div>
          <div className={styles.headCell}>
            <div className={styles.headLabel}>Total</div>
            <div className={styles.headValue}>{formatCurrency(totals.sell)}</div>
          </div>
          <div className={styles.headCell}>
            <div className={styles.headLabel}>Lines</div>
            <div className={styles.headValue}>{typedLines.length}</div>
          </div>
          <div className={`${styles.headCell} ${styles.headActions}`}>
            {shopifyAdminUrl("orders", typedOrder.shopify_order_id) ? (
              <a
                href={shopifyAdminUrl("orders", typedOrder.shopify_order_id)!}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.headActionLink}
              >
                View in Shopify ↗
              </a>
            ) : null}
            <form action={allocateOrder} className={styles.headActionForm}>
              <input type="hidden" name="order_id" value={typedOrder.id} />
              <input type="hidden" name="return_to" value={`/app/orders/${typedOrder.id}`} />
              <input type="hidden" name="idempotency_key" value={crypto.randomUUID()} />
              <button type="submit">Re-run allocation</button>
            </form>
          </div>
        </div>
        <div className={styles.pillsRow}>
          <div className={styles.pillStage}>
            <div className={styles.stageLabel}>Components</div>
            {rollup ? <ComponentsPill state={rollup.components} /> : "—"}
          </div>
          <div className={styles.pillStage}>
            <div className={styles.stageLabel}>Production</div>
            {rollup ? <ProductionPill state={rollup.production} /> : "—"}
          </div>
          <div className={styles.pillStage}>
            <div className={styles.stageLabel}>Delivery</div>
            {rollup ? <DeliveryPill state={rollup.delivery} /> : "—"}
          </div>
        </div>
      </div>

      {query.allocated ? (
        <p className={styles.successMeta}>Allocation updated for this order.</p>
      ) : null}
      {query.planError ? (
        <p className={styles.errorMeta}>Error: {query.planError}</p>
      ) : null}

      <div className={styles.summaryCards}>
        <div className={styles.summaryCard}>
          <span>Order value</span>
          <strong>{formatCurrency(totals.sell)}</strong>
          <p>{typedLines.length} line{typedLines.length === 1 ? "" : "s"} in this order</p>
        </div>
        <div className={styles.summaryCard}>
          <span>Planned margin</span>
          <strong>{formatCurrency(totals.plannedMargin)}</strong>
          <p>{plannedLineCount} line{plannedLineCount === 1 ? "" : "s"} have a cost snapshot</p>
        </div>
        <div className={styles.summaryCard}>
          <span>Lines allocated</span>
          <strong>{allocatedLineCount} / {typedLines.length}</strong>
          {typedLines.length - allocatedLineCount > 0 ? (
            <p>{typedLines.length - allocatedLineCount} need{typedLines.length - allocatedLineCount === 1 ? "s" : ""} a BOM</p>
          ) : (
            <p>All lines allocated</p>
          )}
        </div>
        <div className={styles.summaryCard}>
          <span>Labor scheduled</span>
          <strong>{totals.hours.toFixed(1)} hrs</strong>
          <p>{formatCurrency(totals.actualMargin)} actual margin recorded</p>
        </div>
      </div>

      {overloadSummary.length > 0 ? (
        <section className={styles.warningPanel}>
          <div className={styles.warningHeader}>
            <div>
              <p className={styles.eyebrow}>Capacity risks</p>
              <h2>Department weeks already over capacity</h2>
            </div>
            <StatusBadge variant="danger">
              {overloadSummary.length} conflict{overloadSummary.length === 1 ? "" : "s"}
            </StatusBadge>
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
            <p className={styles.eyebrow}>Order lines</p>
            <h2>Components reserved · BOM · Labor</h2>
          </div>
        </div>

        {typedLines.length === 0 ? (
          <EmptyState
            title="No order lines found"
            message="This order has no synced line items. Trigger a Shopify sync to populate them."
          />
        ) : (
          <div className={styles.lineList}>
            {typedLines.map((line) => {
              const variant = firstRelation(line.variant);
              const product = firstRelation(variant?.product);
              const planned = plannedByLine.get(line.id);
              const plannedHours = laborByLine[line.id] ?? 0;
              const lineLaborPlans = laborPlansByLine[line.id] ?? [];
              const lineStatus = lineStatusMap.get(line.id);
              const allocationState = lineStatus?.allocationState ?? "no-bom";

              return (
                <article
                  key={line.id}
                  className={`${styles.lineCard} ${allocationState !== "allocated" ? styles.lineCardWarning : ""}`}
                >
                  <div className={styles.lineHeader}>
                    {product?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.title ?? ""}
                        className={styles.productThumb}
                      />
                    ) : (
                      <div className={styles.productThumbEmpty} />
                    )}
                    <div className={styles.lineIdentity}>
                      <div className={styles.lineHeading}>
                        <h3>{product?.title ?? variant?.title ?? "Variant"}</h3>
                        <StatusBadge variant={allocationState === "allocated" ? "success" : "warning"}>
                          {allocationState === "allocated"
                            ? "✓ Allocated"
                            : allocationState === "empty-bom"
                            ? "⚠ Empty BOM"
                            : "⚠ No active BOM"}
                        </StatusBadge>
                      </div>
                      <p className={styles.meta}>
                        {variant?.sku ?? "No SKU"} · Qty {line.quantity} · {formatCurrency(line.unit_sell_price)} each
                        {lineStatus?.bom ? (
                          <>
                            {" · "}
                            <Link href={`/app/bom`} className={styles.bomLink}>
                              BOM v{lineStatus.bom.version} →
                            </Link>
                          </>
                        ) : null}
                        {shopifyAdminUrl("products", product?.shopify_id ?? null) ? (
                          <>
                            {" · "}
                            <a
                              href={shopifyAdminUrl("products", product?.shopify_id ?? null)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.shopifyLink}
                            >
                              Shopify ↗
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className={styles.lineMargin}>
                      <span>Planned margin</span>
                      <strong>
                        {planned
                          ? `${formatCurrency(planned.planned_margin)} (${planned.planned_margin_pct.toFixed(1)}%)`
                          : "—"}
                      </strong>
                    </div>
                  </div>

                  {allocationState === "allocated" && lineStatus && lineStatus.components.length > 0 ? (
                    <details className={styles.bomSection}>
                      <summary className={styles.bomToggle}>
                        BOM v{lineStatus.bom?.version} · {lineStatus.components.length} component{lineStatus.components.length === 1 ? "" : "s"} · ×{line.quantity} ordered
                      </summary>
                      <div className={styles.componentSection}>
                        <table className={styles.componentTable}>
                          <thead>
                            <tr>
                              <th>Component</th>
                              <th>Required</th>
                              {showCosts ? <th>Unit cost</th> : null}
                              {showCosts ? <th>Material cost</th> : null}
                              <th>Available</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineStatus.components.map((comp) => (
                              <tr key={comp.componentId}>
                                <td>
                                  <Link href={`/app/components/${comp.componentId}`} className={styles.componentLink}>
                                    {comp.name}
                                  </Link>
                                </td>
                                <td className={styles.numCell}>{comp.requiredQty.toFixed(2)}</td>
                                {showCosts ? <td className={styles.costCell}>{formatCurrency(comp.costPerUnit)}</td> : null}
                                {showCosts ? <td className={styles.costCell}>{formatCurrency(comp.costPerUnit * comp.requiredQty)}</td> : null}
                                <td className={styles.availCell}>
                                  <span className={comp.isShort ? styles.shortBadge : styles.okBadge}>
                                    {comp.isShort
                                      ? `⚠ ${comp.availableQty.toFixed(2)} avail`
                                      : `✓ ${comp.availableQty.toFixed(2)} avail`}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ) : null}

                  {allocationState !== "allocated" ? (
                    <div className={styles.noBomCard}>
                      <p>
                        {allocationState === "empty-bom"
                          ? "Allocation skipped — the active BOM has no components. Add components to the BOM and re-run allocation."
                          : "Allocation skipped — create an active BOM for this variant to reserve components and generate a cost plan."}
                      </p>
                      <Link href="/app/bom" className={styles.bomLink}>
                        Go to BOM →
                      </Link>
                    </div>
                  ) : null}

                  <details className={styles.laborSection}>
                    <summary className={styles.laborToggle}>
                      Labor: {lineLaborPlans.length} operation{lineLaborPlans.length === 1 ? "" : "s"} · {plannedHours.toFixed(1)} hrs
                    </summary>
                    {lineLaborPlans.length === 0 ? (
                      <EmptyState
                        title="No labor operations planned"
                        message="Run planning for this order to place labor by department and week."
                      />
                    ) : (
                      <div className={styles.planList}>
                        {lineLaborPlans.map((plan) => {
                          const department = firstRelation(plan.department);
                          const utilization = utilizationMap.get(`${plan.department_id}:${plan.week_start}`);
                          const overload = Number(utilization?.overload_hours ?? 0);

                          return (
                            <form key={plan.id} action={updateJobLaborPlanWeek} className={styles.planRow}>
                              <input type="hidden" name="plan_id" value={plan.id} />
                              <input type="hidden" name="order_id" value={typedOrder.id} />
                              <input type="hidden" name="return_to" value={`/app/orders/${typedOrder.id}`} />
                              <div className={styles.planIdentity}>
                                <strong>{plan.operation_name}</strong>
                                <p className={styles.meta}>
                                  {department?.name ?? "Department"} · Seq {plan.sequence}
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
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
