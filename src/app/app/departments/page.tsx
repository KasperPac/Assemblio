import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "../planning.module.css";
import deptStyles from "./departments.module.css";
import { createDepartment, updateDepartment } from "./actions";

type DepartmentRow = {
  id: string;
  name: string;
  code: string;
  default_efficiency_pct: number;
  is_active: boolean;
};

type RateScheduleRow = {
  id: string;
  department_id: string | null;
  effective_from: string;
  labor_rate_per_hour: number;
  admin_rate_per_hour: number;
  electricity_rate_per_kwh: number;
  gas_rate_per_unit: number;
  overhead_rate_per_hour: number;
};

type Props = {
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function DepartmentsPage({ searchParams }: Props) {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;
  const params = (await searchParams) ?? {};
  const today = new Date().toISOString().slice(0, 10);

  const [{ data, error }, { data: rateSchedules }] = await Promise.all([
    supabase
      .from("department")
      .select("id,name,code,default_efficiency_pct,is_active")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("cost_rate_schedule")
      .select(
        "id,department_id,effective_from,labor_rate_per_hour,admin_rate_per_hour,electricity_rate_per_kwh,gas_rate_per_unit,overhead_rate_per_hour"
      )
      .eq("tenant_id", tenantId)
      .is("staff_member_id", null)
      .order("effective_from", { ascending: false }),
  ]);

  const rows = (data ?? []) as DepartmentRow[];
  const activeCount = rows.filter((r) => r.is_active).length;

  const currentRates = new Map<string, RateScheduleRow>();
  for (const row of (rateSchedules ?? []) as RateScheduleRow[]) {
    if (row.department_id && !currentRates.has(row.department_id)) {
      currentRates.set(row.department_id, row);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p>Work centres for the planning floor board. Each department gets its own queue column.</p>
        </div>
        {activeCount > 0 && (
          <span className={styles.status}>{activeCount} active</span>
        )}
      </div>

      {params.success && (
        <div className={`${deptStyles.notice} ${deptStyles.noticeSuccess}`}>
          {params.success}
        </div>
      )}
      {params.error && (
        <div className={`${deptStyles.notice} ${deptStyles.noticeError}`}>
          {params.error}
        </div>
      )}

      {/* Existing departments */}
      {error ? (
        <div className={`${deptStyles.notice} ${deptStyles.noticeError}`}>
          Failed to load departments.
        </div>
      ) : rows.length > 0 ? (
        <section className={styles.table}>
          <h3>Departments</h3>
          <div className={styles.tableRows}>
            {rows.map((row) => {
              const rate = currentRates.get(row.id);
              return (
                <form key={row.id} action={updateDepartment} className={deptStyles.deptCard}>
                  <input type="hidden" name="department_id" value={row.id} />
                  <input type="hidden" name="rate_schedule_id" value={rate?.id ?? ""} />

                  <div className={deptStyles.deptCardHeader}>
                    <div className={deptStyles.deptIdentity}>
                      <span className={deptStyles.deptName}>{row.name}</span>
                      <span className={deptStyles.codeBadge}>{row.code}</span>
                    </div>
                    <label className={deptStyles.activeToggle}>
                      <input type="checkbox" name="is_active" defaultChecked={row.is_active} />
                      Active
                    </label>
                  </div>

                  <div className={deptStyles.divider} />

                  <div className={deptStyles.fieldsGrid}>
                    <div className={styles.field}>
                      <label>Name</label>
                      <input name="name" defaultValue={row.name} required />
                    </div>
                    <div className={styles.field}>
                      <label>Code</label>
                      <input name="code" defaultValue={row.code} required />
                    </div>
                    <input type="hidden" name="default_efficiency_pct" value={row.default_efficiency_pct} />
                    <div className={styles.field}>
                      <label>Labor $/hr</label>
                      <input name="labor_rate_per_hour" type="number" min="0" step="0.01" defaultValue={rate?.labor_rate_per_hour ?? 0} />
                    </div>
                    <div className={styles.field}>
                      <label>Admin $/hr</label>
                      <input name="admin_rate_per_hour" type="number" min="0" step="0.01" defaultValue={rate?.admin_rate_per_hour ?? 0} />
                    </div>
                    <div className={styles.field}>
                      <label>Electricity $/kWh</label>
                      <input name="electricity_rate_per_kwh" type="number" min="0" step="0.01" defaultValue={rate?.electricity_rate_per_kwh ?? 0} />
                    </div>
                    <div className={styles.field}>
                      <label>Gas $/unit</label>
                      <input name="gas_rate_per_unit" type="number" min="0" step="0.01" defaultValue={rate?.gas_rate_per_unit ?? 0} />
                    </div>
                    <div className={styles.field}>
                      <label>Overhead $/hr</label>
                      <input name="overhead_rate_per_hour" type="number" min="0" step="0.01" defaultValue={rate?.overhead_rate_per_hour ?? 0} />
                    </div>
                    <div className={styles.field}>
                      <label>Rates from</label>
                      <input
                        name="effective_from"
                        type="date"
                        defaultValue={rate?.effective_from ?? today}
                      />
                    </div>
                  </div>

                  <div className={deptStyles.saveRow}>
                    <button className={styles.primary} type="submit">Save</button>
                  </div>
                </form>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Add department */}
      <section className={styles.card}>
        <h3>Add department</h3>
        <form action={createDepartment} className={deptStyles.createForm}>
          <div className={deptStyles.fieldsGrid}>
            <div className={styles.field}>
              <label htmlFor="name">Name</label>
              <input id="name" name="name" placeholder="Assembly" required />
            </div>
            <div className={styles.field}>
              <label htmlFor="code">Code</label>
              <input id="code" name="code" placeholder="ASM" required />
            </div>
            <input type="hidden" id="default_efficiency_pct" name="default_efficiency_pct" value="100" />
            <div className={styles.field}>
              <label htmlFor="labor_rate_per_hour">Labor $/hr</label>
              <input id="labor_rate_per_hour" name="labor_rate_per_hour" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className={styles.field}>
              <label htmlFor="admin_rate_per_hour">Admin $/hr</label>
              <input id="admin_rate_per_hour" name="admin_rate_per_hour" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className={styles.field}>
              <label htmlFor="electricity_rate_per_kwh">Electricity $/kWh</label>
              <input id="electricity_rate_per_kwh" name="electricity_rate_per_kwh" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className={styles.field}>
              <label htmlFor="gas_rate_per_unit">Gas $/unit</label>
              <input id="gas_rate_per_unit" name="gas_rate_per_unit" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className={styles.field}>
              <label htmlFor="overhead_rate_per_hour">Overhead $/hr</label>
              <input id="overhead_rate_per_hour" name="overhead_rate_per_hour" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className={styles.field}>
              <label htmlFor="effective_from">Rates from</label>
              <input id="effective_from" name="effective_from" type="date" defaultValue={today} />
            </div>
          </div>

          <div className={deptStyles.saveRow}>
            <button className={styles.primary} type="submit">Create Department</button>
          </div>
        </form>
      </section>
    </div>
  );
}
