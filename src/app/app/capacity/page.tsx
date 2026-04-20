import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../planning.module.css";
import { refreshCapacityWeek } from "./actions";

type DepartmentRelation = { name: string | null } | { name: string | null }[] | null;

type CapacityRow = {
  id: string;
  department_id: string;
  week_start: string;
  available_hours: number;
  overtime_hours: number;
  capacity_hours_total: number;
  department: DepartmentRelation;
};

type UtilizationRow = {
  id: string;
  department_id: string;
  week_start: string;
  planned_hours: number;
  actual_hours: number;
  available_hours: number;
  overload_hours: number;
  idle_hours: number;
  utilization_pct: number;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function resolveWeekStart(raw: string | undefined) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  return getWeekStart();
}

type Props = {
  searchParams?: Promise<{
    week?: string;
    success?: string;
    error?: string;
  }>;
};

export default async function CapacityPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const params = (await searchParams) ?? {};
  const weekStart = resolveWeekStart(params.week);

  const [{ count: openOrdersCount }, { data: capacities }, { data: utilization }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .not("status", "in", '("fulfilled","cancelled")'),
      supabase
        .from("department_capacity_week")
        .select(
          "id,department_id,week_start,available_hours,overtime_hours,capacity_hours_total,department:department_id(name)"
        )
        .eq("week_start", weekStart)
        .order("capacity_hours_total", { ascending: false }),
      supabase
        .from("department_utilization_week")
        .select(
          "id,department_id,week_start,planned_hours,actual_hours,available_hours,overload_hours,idle_hours,utilization_pct"
        )
        .eq("week_start", weekStart),
    ]);

  const capacityRows = (capacities ?? []) as CapacityRow[];
  const utilizationRows = (utilization ?? []) as UtilizationRow[];
  const utilizationMap = new Map(
    utilizationRows.map((row) => [row.department_id, row])
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Weekly Planner</span>
          <h1>Capacity Planner</h1>
          <p>
            Weekly department loading based on labor BOM demand versus available
            staffing capacity.
          </p>
        </div>
        <form action={refreshCapacityWeek}>
          <input type="hidden" name="week" value={weekStart} />
          <button className={styles.primary} type="submit">
            Refresh Capacity
          </button>
        </form>
      </div>

      {params.success ? (
        <div className={styles.callout}>
          <h3>Updated</h3>
          <p className={styles.muted}>{params.success}</p>
        </div>
      ) : null}
      {params.error ? (
        <div className={styles.callout}>
          <h3>Refresh failed</h3>
          <p className={styles.muted}>{params.error}</p>
        </div>
      ) : null}

      <section className={styles.hero}>
        <div>
          <h2>Week starting {weekStart}</h2>
          <form method="get" className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="week">Planning week</label>
              <input id="week" name="week" type="date" defaultValue={weekStart} />
            </div>
            <div className={`${styles.actionsRow} ${styles.spanTwo}`}>
              <button className={styles.secondary} type="submit">
                Load Week
              </button>
            </div>
          </form>
          <p className={styles.muted}>
            The first release plans by department and week so bottlenecks are
            visible before person-level scheduling exists.
          </p>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Orders to Plan</span>
              <strong>{openOrdersCount ?? 0}</strong>
            </div>
            <div className={styles.metric}>
              <span>Departments</span>
              <strong>{capacityRows.length}</strong>
            </div>
            <div className={styles.metric}>
              <span>Scheduling Grain</span>
              <strong>Week</strong>
            </div>
          </div>
        </div>
        <div className={styles.callout}>
          <h3>Planner rule</h3>
          <p className={styles.muted}>
            Planned labor hours should be assigned to the earliest feasible week
            that does not overload the department unless the planner overrides
            it explicitly.
          </p>
        </div>
      </section>

      <section className={styles.table}>
        <h3>Department weekly load</h3>
        <div className={styles.tableHeader}>
          <span>Department</span>
          <span>Available</span>
          <span>Planned</span>
        </div>
        <div className={styles.tableRows}>
          {capacityRows.length === 0 ? (
            <div className={styles.stackRow}>
              No weekly capacity rows found for {weekStart}.
            </div>
          ) : (
            capacityRows.map((row) => {
              const department = firstRelation(row.department);
              const load = utilizationMap.get(row.department_id);
              const plannedHours = Number(load?.planned_hours ?? 0);
              const note =
                Number(load?.overload_hours ?? 0) > 0
                  ? `Over by ${load?.overload_hours} hrs`
                  : `Spare ${load?.idle_hours ?? 0} hrs`;

              return (
                <div key={row.id} className={styles.tableRow}>
                  <div>
                    <strong>{department?.name ?? "Department"}</strong>
                    <div className={styles.subtle}>{note}</div>
                  </div>
                  <span>{row.capacity_hours_total} hrs</span>
                  <span
                    className={`${styles.status} ${
                      Number(load?.overload_hours ?? 0) > 0 ? styles.warning : ""
                    }`}
                  >
                    {plannedHours} hrs
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
