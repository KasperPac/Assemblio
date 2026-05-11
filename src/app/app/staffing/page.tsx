import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "../planning.module.css";
import Link from "next/link";
import { getWeekStart } from "@/lib/dates";
import {
  createStaffMember,
  prepareStaffingWeek,
  updateStaffMember,
} from "./actions";

type DepartmentRelation = { name: string | null } | { name: string | null }[] | null;

type StaffRow = {
  id: string;
  department_id: string;
  name: string;
  employment_type: string;
  annual_salary: number | null;
  hourly_rate: number | null;
  standard_weekly_hours: number;
  is_active: boolean;
  department: DepartmentRelation;
};

type AvailabilityRow = {
  staff_member_id: string;
  contracted_hours: number;
  leave_hours: number;
  training_hours: number;
  non_productive_hours: number;
  overtime_hours: number;
  available_hours_net: number;
};

type DepartmentOption = {
  id: string;
  name: string;
  code: string;
};

type CapacityRow = {
  department_id: string;
  capacity_hours_total: number;
  department: DepartmentRelation;
};

type UtilizationRow = {
  department_id: string;
  planned_hours: number;
  overload_hours: number;
  idle_hours: number;
  utilization_pct: number;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type Props = {
  searchParams?: Promise<{
    success?: string;
    error?: string;
    week?: string;
  }>;
};

function resolveWeekStart(raw: string | undefined) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  return getWeekStart();
}

function shiftWeek(weekStart: string, deltaDays: number) {
  const next = new Date(`${weekStart}T00:00:00`);
  next.setDate(next.getDate() + deltaDays);
  return next.toISOString().slice(0, 10);
}

export default async function StaffingPage({ searchParams }: Props) {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;
  const params = (await searchParams) ?? {};
  const weekStart = resolveWeekStart(params.week);

  const [
    { data: staff, error },
    { data: availability },
    { data: departments },
    { data: capacities },
    { data: utilization },
  ] = await Promise.all([
    supabase
      .from("staff_member")
      .select(
        "id,name,department_id,employment_type,annual_salary,hourly_rate,standard_weekly_hours,is_active,department:department_id(name)"
      )
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("staff_availability_week")
      .select(
        "staff_member_id,contracted_hours,leave_hours,training_hours,non_productive_hours,overtime_hours,available_hours_net"
      )
      .eq("tenant_id", tenantId)
      .eq("week_start", weekStart),
    supabase.from("department").select("id,name,code").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
    supabase
      .from("department_capacity_week")
      .select("department_id,capacity_hours_total,department:department_id(name)")
      .eq("tenant_id", tenantId)
      .eq("week_start", weekStart),
    supabase
      .from("department_utilization_week")
      .select("department_id,planned_hours,overload_hours,idle_hours,utilization_pct")
      .eq("tenant_id", tenantId)
      .eq("week_start", weekStart),
  ]);

  const rows = (staff ?? []) as StaffRow[];
  const availabilityRows = (availability ?? []) as AvailabilityRow[];
  const departmentRows = (departments ?? []) as DepartmentOption[];
  const capacityRows = (capacities ?? []) as CapacityRow[];
  const utilizationRows = (utilization ?? []) as UtilizationRow[];
  const availabilityMap = new Map(
    availabilityRows.map((row) => [row.staff_member_id, row])
  );
  const capacityMap = new Map(
    capacityRows.map((row) => [row.department_id, row])
  );
  const utilizationMap = new Map(
    utilizationRows.map((row) => [row.department_id, row])
  );
  const previousWeek = shiftWeek(weekStart, -7);
  const nextWeek = shiftWeek(weekStart, 7);
  const missingAvailabilityCount = rows.filter(
    (row) => !availabilityMap.has(row.id) && row.is_active
  ).length;
  const contractedTotal = availabilityRows.reduce(
    (sum, row) => sum + Number(row.contracted_hours ?? 0),
    0
  );
  const leaveTotal = availabilityRows.reduce(
    (sum, row) =>
      sum +
      Number(row.leave_hours ?? 0) +
      Number(row.training_hours ?? 0) +
      Number(row.non_productive_hours ?? 0),
    0
  );
  const netTotal = availabilityRows.reduce(
    (sum, row) => sum + Number(row.available_hours_net ?? 0),
    0
  );
  const departmentPressure = departmentRows
    .map((department) => {
      const capacity = capacityMap.get(department.id);
      const load = utilizationMap.get(department.id);
      return {
        id: department.id,
        name: department.name,
        code: department.code,
        capacityHours: Number(capacity?.capacity_hours_total ?? 0),
        plannedHours: Number(load?.planned_hours ?? 0),
        overloadHours: Number(load?.overload_hours ?? 0),
        idleHours: Number(load?.idle_hours ?? 0),
        utilizationPct: Number(load?.utilization_pct ?? 0),
      };
    })
    .filter((department) => department.capacityHours > 0 || department.plannedHours > 0)
    .sort((a, b) => b.overloadHours - a.overloadHours || b.plannedHours - a.plannedHours);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Labor Model</span>
          <h1>Staffing</h1>
          <p>
            Rates, contracted hours, and weekly availability that feed costing
            and capacity calculations.
          </p>
        </div>
        <span className={styles.status}>Editable labor model</span>
      </div>

      {params.success ? (
        <div className={styles.callout}>
          <h3>Saved</h3>
          <p className={styles.muted}>{params.success}</p>
        </div>
      ) : null}
      {params.error ? (
        <div className={styles.callout}>
          <h3>Update failed</h3>
          <p className={styles.muted}>{params.error}</p>
        </div>
      ) : null}

      <section className={styles.hero}>
        <div>
          <h2>Availability for week starting {weekStart}</h2>
          <div className={styles.inlineLinks}>
            <Link href={`/app/staffing?week=${previousWeek}`}>Previous week</Link>
            <Link href={`/app/staffing?week=${getWeekStart()}`}>Current week</Link>
            <Link href={`/app/staffing?week=${nextWeek}`}>Next week</Link>
          </div>
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
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Active Staff</span>
              <strong>{rows.filter((row) => row.is_active).length}</strong>
            </div>
            <div className={styles.metric}>
              <span>Contracted</span>
              <strong>{contractedTotal}</strong>
            </div>
            <div className={styles.metric}>
              <span>Net Available</span>
              <strong>{netTotal}</strong>
            </div>
            <div className={styles.metric}>
              <span>Missing Rows</span>
              <strong>{missingAvailabilityCount}</strong>
            </div>
          </div>
        </div>
        <div className={styles.callout}>
          <h3>Prepare this week</h3>
          <p className={styles.muted}>
            Create default availability rows for any active staff who do not
            yet have one for <strong>{weekStart}</strong>. Current lost time for
            the selected week is <strong>{leaveTotal}</strong> hours.
          </p>
          <form action={prepareStaffingWeek} className={styles.inlineForm}>
            <input type="hidden" name="week_start" value={weekStart} />
            <button className={styles.secondary} type="submit">
              Prepare Staffing Week
            </button>
          </form>
        </div>
      </section>

      <section className={styles.table}>
        <div className={styles.sectionTitle}>
          <div>
            <h3>Department pressure for {weekStart}</h3>
            <p className={styles.muted}>
              Capacity risk here should line up with the overloaded order weeks in the planner.
            </p>
          </div>
          <Link className={styles.secondaryLink} href={`/app/capacity?week=${weekStart}`}>
            Open capacity planner
          </Link>
        </div>
        <div className={styles.tableHeader}>
          <span>Department</span>
          <span>Capacity</span>
          <span>Load</span>
        </div>
        <div className={styles.tableRows}>
          {departmentPressure.length === 0 ? (
            <div className={styles.stackRow}>
              No department capacity or utilization has been generated for this week yet.
            </div>
          ) : (
            departmentPressure.map((department) => (
              <div key={department.id} className={styles.tableRow}>
                <div>
                  <strong>
                    {department.name} ({department.code})
                  </strong>
                  <div className={styles.subtle}>
                    {department.overloadHours > 0
                      ? `Over by ${department.overloadHours.toFixed(1)} hrs`
                      : `Spare ${department.idleHours.toFixed(1)} hrs`}
                  </div>
                </div>
                <span>{department.capacityHours.toFixed(1)} hrs</span>
                <span
                  className={`${styles.status} ${
                    department.overloadHours > 0 ? styles.warning : ""
                  }`}
                >
                  {department.plannedHours.toFixed(1)} hrs | {department.utilizationPct.toFixed(0)}%
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={styles.card}>
        <h3>Add staff member</h3>
        <form action={createStaffMember} className={styles.formGrid}>
          <input type="hidden" name="week_start" value={weekStart} />
          <div className={styles.field}>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" placeholder="Alex Morgan" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="department_id">Department</label>
            <select id="department_id" name="department_id" defaultValue="" required>
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
            <label htmlFor="employment_type">Employment type</label>
            <select id="employment_type" name="employment_type" defaultValue="salary">
              <option value="salary">Salary</option>
              <option value="hourly">Hourly</option>
              <option value="contract">Contract</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="annual_salary">Annual salary</label>
            <input id="annual_salary" name="annual_salary" type="number" min="0" step="0.01" />
          </div>
          <div className={styles.field}>
            <label htmlFor="hourly_rate">Hourly rate</label>
            <input id="hourly_rate" name="hourly_rate" type="number" min="0" step="0.01" />
          </div>
          <div className={styles.field}>
            <label htmlFor="standard_weekly_hours">Standard weekly hours</label>
            <input
              id="standard_weekly_hours"
              name="standard_weekly_hours"
              type="number"
              min="0"
              step="0.25"
              defaultValue="38"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="contracted_hours">Contracted this week</label>
            <input id="contracted_hours" name="contracted_hours" type="number" min="0" step="0.25" defaultValue="38" />
          </div>
          <div className={styles.field}>
            <label htmlFor="leave_hours">Leave hours</label>
            <input id="leave_hours" name="leave_hours" type="number" min="0" step="0.25" defaultValue="0" />
          </div>
          <div className={styles.field}>
            <label htmlFor="training_hours">Training hours</label>
            <input id="training_hours" name="training_hours" type="number" min="0" step="0.25" defaultValue="0" />
          </div>
          <div className={styles.field}>
            <label htmlFor="non_productive_hours">Non-productive hours</label>
            <input id="non_productive_hours" name="non_productive_hours" type="number" min="0" step="0.25" defaultValue="0" />
          </div>
          <div className={styles.field}>
            <label htmlFor="overtime_hours">Overtime hours</label>
            <input id="overtime_hours" name="overtime_hours" type="number" min="0" step="0.25" defaultValue="0" />
          </div>
          <div className={`${styles.actionsRow} ${styles.spanTwo}`}>
            <button className={styles.primary} type="submit">
              Create Staff Member
            </button>
          </div>
        </form>
      </section>

      <section className={styles.table}>
        <h3>Staff roster for selected week</h3>
        <div className={styles.tableHeader}>
          <span>Staff</span>
          <span>Weekly Hours</span>
          <span>Rate Basis</span>
        </div>
        <div className={styles.tableRows}>
          {error ? (
            <div className={styles.stackRow}>Failed to load staffing.</div>
          ) : rows.length === 0 ? (
            <div className={styles.stackRow}>No staff members configured yet.</div>
          ) : (
            rows.map((row) => {
              const department = firstRelation(row.department);
              const availabilityRow = availabilityMap.get(row.id);
              const rateLabel =
                row.hourly_rate !== null
                  ? `$${row.hourly_rate}/hr`
                  : row.annual_salary !== null
                  ? `$${row.annual_salary}/yr`
                  : row.employment_type;

              return (
                <form key={row.id} action={updateStaffMember} className={styles.stackRow}>
                  <input type="hidden" name="staff_member_id" value={row.id} />
                  <input type="hidden" name="week_start" value={weekStart} />
                  <div className={styles.formGrid}>
                    <div className={styles.field}>
                      <label>Name</label>
                      <input name="name" defaultValue={row.name} required />
                    </div>
                    <div className={styles.field}>
                      <label>Department</label>
                      <select name="department_id" defaultValue={row.department_id} required>
                        {departmentRows.map((departmentOption) => (
                          <option key={departmentOption.id} value={departmentOption.id}>
                            {departmentOption.name} ({departmentOption.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label>Employment type</label>
                      <select name="employment_type" defaultValue={row.employment_type}>
                        <option value="salary">Salary</option>
                        <option value="hourly">Hourly</option>
                        <option value="contract">Contract</option>
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label>Annual salary</label>
                      <input
                        name="annual_salary"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={row.annual_salary ?? ""}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Hourly rate</label>
                      <input
                        name="hourly_rate"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={row.hourly_rate ?? ""}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Standard weekly hours</label>
                      <input
                        name="standard_weekly_hours"
                        type="number"
                        min="0"
                        step="0.25"
                        defaultValue={row.standard_weekly_hours}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Contracted this week</label>
                      <input
                        name="contracted_hours"
                        type="number"
                        min="0"
                        step="0.25"
                        defaultValue={availabilityRow?.contracted_hours ?? row.standard_weekly_hours}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Leave hours</label>
                      <input
                        name="leave_hours"
                        type="number"
                        min="0"
                        step="0.25"
                        defaultValue={availabilityRow?.leave_hours ?? 0}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Training hours</label>
                      <input
                        name="training_hours"
                        type="number"
                        min="0"
                        step="0.25"
                        defaultValue={availabilityRow?.training_hours ?? 0}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Non-productive hours</label>
                      <input
                        name="non_productive_hours"
                        type="number"
                        min="0"
                        step="0.25"
                        defaultValue={availabilityRow?.non_productive_hours ?? 0}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Overtime hours</label>
                      <input
                        name="overtime_hours"
                        type="number"
                        min="0"
                        step="0.25"
                        defaultValue={availabilityRow?.overtime_hours ?? 0}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Current rate view</label>
                      <div className={styles.status}>{rateLabel}</div>
                      <div className={styles.subtle}>
                        Net available: {availabilityRow?.available_hours_net ?? row.standard_weekly_hours} hrs
                      </div>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.subtle}>
                        <input type="checkbox" name="is_active" defaultChecked={row.is_active} /> Active
                      </label>
                      <div className={styles.subtle}>
                        {department?.name ?? "Unassigned department"}
                      </div>
                    </div>
                    <div className={`${styles.actionsRow} ${styles.spanTwo}`}>
                      <button className={styles.primary} type="submit">
                        Save Staff Member
                      </button>
                    </div>
                  </div>
                </form>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
