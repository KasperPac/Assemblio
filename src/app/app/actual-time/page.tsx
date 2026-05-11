import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "../planning.module.css";
import { createActualTimeEntry } from "./actions";

type Relation<T> = T | T[] | null;

type DepartmentRow = {
  id: string;
  name: string;
  code: string;
};

type StaffMemberRow = {
  id: string;
  name: string;
  department_id: string;
};

type OrderSummary = {
  shopify_order_id: string | null;
  status: string;
};

type ProductSummary = {
  title: string;
};

type VariantSummary = {
  title: string | null;
  sku: string | null;
  product: Relation<ProductSummary>;
};

type OrderLineRow = {
  id: string;
  quantity: number;
  line_sell_price: number;
  orders: Relation<OrderSummary>;
  variant: Relation<VariantSummary>;
};

type TimeEntryRow = {
  id: string;
  hours: number;
  labor_cost_amount: number;
  entry_type: string;
  created_at: string;
  department: Relation<{ name: string | null }>;
  staff_member: Relation<{ name: string | null }>;
};

type RollupRow = {
  id: string;
  actual_total_cost: number;
  actual_margin: number;
  actual_hours_total: number;
  order_line: Relation<{
    line_sell_price: number;
    variant: Relation<{ title: string | null; sku: string | null }>;
  }>;
};

type Props = {
  searchParams?: Promise<{
    created?: string;
    error?: string;
  }>;
};

function firstRelation<T>(value: Relation<T> | undefined): T | null {
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

export default async function ActualTimePage({ searchParams }: Props) {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;
  const params = (await searchParams) ?? {};

  const [
    { data: departments },
    { data: staffMembers },
    { data: orderLines },
    { data: entries, error: entriesError },
    { data: rollups, error: rollupsError },
  ] = await Promise.all([
    supabase
      .from("department")
      .select("id,name,code")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("staff_member")
      .select("id,name,department_id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("order_line")
      .select(
        "id,quantity,line_sell_price,orders:order_id(shopify_order_id,status),variant:variant_id(title,sku,product:product_id(title))"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("job_actual_time_entry")
      .select(
        "id,hours,labor_cost_amount,entry_type,created_at,department:department_id(name),staff_member:staff_member_id(name)"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("job_cost_actual_rollup")
      .select(
        "id,actual_total_cost,actual_margin,actual_hours_total,order_line:order_line_id(line_sell_price,variant:variant_id(title,sku))"
      )
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const departmentRows = (departments ?? []) as DepartmentRow[];
  const staffRows = (staffMembers ?? []) as StaffMemberRow[];
  const orderLineRows = (orderLines ?? []) as OrderLineRow[];
  const timeRows = (entries ?? []) as TimeEntryRow[];
  const rollupRows = (rollups ?? []) as RollupRow[];
  const hoursTotal = timeRows.reduce((sum, row) => sum + Number(row.hours ?? 0), 0);
  const laborTotal = timeRows.reduce(
    (sum, row) => sum + Number(row.labor_cost_amount ?? 0),
    0
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Actuals</span>
          <h1>Actual Time</h1>
          <p>
            Post manual hours against live jobs now, then evolve into
            staff-level clock on and clock off later.
          </p>
        </div>
      </div>

      {params.created ? (
        <div className={styles.callout}>
          <h3>Time entry posted</h3>
          <p className={styles.muted}>
            Actual labor cost and weekly utilization were refreshed.
          </p>
        </div>
      ) : null}
      {params.error ? (
        <div className={styles.callout}>
          <h3>Posting failed</h3>
          <p className={styles.muted}>{params.error}</p>
        </div>
      ) : null}

      <section className={styles.hero}>
        <div>
          <h2>Recent actual labor capture</h2>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Entries</span>
              <strong>{timeRows.length}</strong>
            </div>
            <div className={styles.metric}>
              <span>Hours</span>
              <strong>{hoursTotal}</strong>
            </div>
            <div className={styles.metric}>
              <span>Labor Cost</span>
              <strong>{formatCurrency(laborTotal)}</strong>
            </div>
          </div>
        </div>
        <div className={styles.callout}>
          <h3>Posting model</h3>
          <p className={styles.muted}>
            Actuals are department-first. Staff remains optional so supervisors
            can post job hours before the full employee clocking workflow lands.
          </p>
        </div>
      </section>

      <section className={styles.card}>
        <h3>Add time entry</h3>
        {orderLineRows.length === 0 || departmentRows.length === 0 ? (
          <div className={styles.stackRow}>
            Orders and departments are required before actual time can be
            posted.
          </div>
        ) : (
          <form action={createActualTimeEntry} className={styles.formGrid}>
            <div className={`${styles.field} ${styles.spanTwo}`}>
              <label htmlFor="order_line_id">Order line</label>
              <select id="order_line_id" name="order_line_id" defaultValue="">
                <option value="" disabled>
                  Select an order line
                </option>
                {orderLineRows.map((row) => {
                  const order = firstRelation(row.orders);
                  const variant = firstRelation(row.variant);
                  const product = firstRelation(variant?.product);
                  const label = [
                    order?.shopify_order_id ? `Order ${order.shopify_order_id}` : "Order",
                    product?.title ?? variant?.title ?? "Variant",
                    variant?.sku ? `(${variant.sku})` : null,
                    `x${row.quantity}`,
                  ]
                    .filter(Boolean)
                    .join(" | ");

                  return (
                    <option key={row.id} value={row.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="department_id">Department</label>
              <select id="department_id" name="department_id" defaultValue="">
                <option value="" disabled>
                  Select department
                </option>
                {departmentRows.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="staff_member_id">Staff member</label>
              <select id="staff_member_id" name="staff_member_id" defaultValue="">
                <option value="">Department-level entry</option>
                {staffRows.map((staffMember) => (
                  <option key={staffMember.id} value={staffMember.id}>
                    {staffMember.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="hours">Hours</label>
              <input
                id="hours"
                name="hours"
                type="number"
                min="0.25"
                step="0.25"
                placeholder="3.5"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="started_at">Started at</label>
              <input id="started_at" name="started_at" type="datetime-local" />
            </div>

            <div className={styles.field}>
              <label htmlFor="ended_at">Ended at</label>
              <input id="ended_at" name="ended_at" type="datetime-local" />
            </div>

            <div className={`${styles.field} ${styles.spanTwo}`}>
              <label htmlFor="note">Note</label>
              <textarea
                id="note"
                name="note"
                placeholder="What was completed during this labor booking?"
              />
            </div>

            <div className={`${styles.actionsRow} ${styles.spanTwo}`}>
              <button className={styles.primary} type="submit">
                Post Time Entry
              </button>
            </div>
          </form>
        )}
      </section>

      <section className={styles.twoCol}>
        <div className={styles.table}>
          <h3>Recent time entries</h3>
          <div className={styles.tableHeader}>
            <span>Entry</span>
            <span>Hours</span>
            <span>Labor Cost</span>
          </div>
          <div className={styles.tableRows}>
            {entriesError ? (
              <div className={styles.stackRow}>Failed to load actual time.</div>
            ) : timeRows.length === 0 ? (
              <div className={styles.stackRow}>No time entries posted yet.</div>
            ) : (
              timeRows.map((row) => {
                const department = firstRelation(row.department);
                const staffMember = firstRelation(row.staff_member);

                return (
                  <div key={row.id} className={styles.tableRow}>
                    <div>
                      <strong>{staffMember?.name ?? "Department entry"}</strong>
                      <div className={styles.subtle}>
                        {department?.name ?? "Department"} | {row.entry_type}
                      </div>
                    </div>
                    <span>{row.hours}</span>
                    <span className={styles.status}>
                      {formatCurrency(row.labor_cost_amount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={styles.table}>
          <h3>Actual cost rollups</h3>
          <div className={styles.tableHeader}>
            <span>Job</span>
            <span>Total Cost</span>
            <span>Margin</span>
          </div>
          <div className={styles.tableRows}>
            {rollupsError ? (
              <div className={styles.stackRow}>Failed to load rollups.</div>
            ) : rollupRows.length === 0 ? (
              <div className={styles.stackRow}>
                No actual cost rollups exist yet.
              </div>
            ) : (
              rollupRows.map((row) => {
                const orderLine = firstRelation(row.order_line);
                const variant = firstRelation(orderLine?.variant);

                return (
                  <div key={row.id} className={styles.tableRow}>
                    <div>
                      <strong>{variant?.title ?? variant?.sku ?? "Order line"}</strong>
                      <div className={styles.subtle}>
                        Hours: {row.actual_hours_total} | Sell:{" "}
                        {formatCurrency(orderLine?.line_sell_price ?? 0)}
                      </div>
                    </div>
                    <span>{formatCurrency(row.actual_total_cost)}</span>
                    <span className={styles.status}>
                      {formatCurrency(row.actual_margin)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
