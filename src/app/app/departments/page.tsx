import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../planning.module.css";
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
  const supabase = await createSupabaseServerClient();
  const params = (await searchParams) ?? {};
  const [{ data, error }, { data: rateSchedules }] = await Promise.all([
    supabase
      .from("department")
      .select("id,name,code,default_efficiency_pct,is_active")
      .order("name"),
    supabase
      .from("cost_rate_schedule")
      .select(
        "id,department_id,effective_from,labor_rate_per_hour,admin_rate_per_hour,electricity_rate_per_kwh,gas_rate_per_unit,overhead_rate_per_hour"
      )
      .is("staff_member_id", null)
      .order("effective_from", { ascending: false }),
  ]);

  const rows = (data ?? []) as DepartmentRow[];
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
          <span className={styles.eyebrow}>Phase 1 Foundation</span>
          <h1>Departments</h1>
          <p>
            Work centers, costing buckets, and weekly capacity anchors for the
            finance-planning rollout.
          </p>
        </div>
        <span className={styles.status}>Editable foundation</span>
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
          <h2>What this module controls</h2>
          <p className={styles.muted}>
            Departments anchor labor rates, weekly capacity, labor planning,
            and later employee time capture. This release keeps scheduling at
            the department/week layer.
          </p>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Departments</span>
              <strong>{rows.length}</strong>
            </div>
            <div className={styles.metric}>
              <span>Planning Grain</span>
              <strong>Weekly</strong>
            </div>
            <div className={styles.metric}>
              <span>Costing Grain</span>
              <strong>Dept Rate</strong>
            </div>
          </div>
        </div>
        <div className={styles.callout}>
          <h3>Implementation note</h3>
          <p className={styles.muted}>
            The model is set up so future person-level tracking hangs off these
            same departments instead of replacing them.
          </p>
        </div>
      </section>

      <section className={styles.card}>
        <h3>Add department</h3>
        <form action={createDepartment} className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" placeholder="Assembly" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="code">Code</label>
            <input id="code" name="code" placeholder="ASM" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="default_efficiency_pct">Efficiency %</label>
            <input
              id="default_efficiency_pct"
              name="default_efficiency_pct"
              type="number"
              min="0"
              step="1"
              defaultValue="100"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="effective_from">Rates effective from</label>
            <input
              id="effective_from"
              name="effective_from"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </div>
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
          <div className={`${styles.actionsRow} ${styles.spanTwo}`}>
            <button className={styles.primary} type="submit">
              Create Department
            </button>
          </div>
        </form>
      </section>

      <section className={styles.table}>
        <h3>Department model</h3>
        <div className={styles.tableHeader}>
          <span>Department</span>
          <span>Efficiency</span>
          <span>Status</span>
        </div>
        <div className={styles.tableRows}>
          {error ? (
            <div className={styles.stackRow}>Failed to load departments.</div>
          ) : rows.length === 0 ? (
            <div className={styles.stackRow}>No departments configured yet.</div>
          ) : (
            rows.map((row) => {
              const rate = currentRates.get(row.id);
              return (
                <form key={row.id} action={updateDepartment} className={styles.stackRow}>
                  <input type="hidden" name="department_id" value={row.id} />
                  <input
                    type="hidden"
                    name="rate_schedule_id"
                    value={rate?.id ?? ""}
                  />
                  <div className={styles.formGrid}>
                    <div className={styles.field}>
                      <label>Name</label>
                      <input name="name" defaultValue={row.name} required />
                    </div>
                    <div className={styles.field}>
                      <label>Code</label>
                      <input name="code" defaultValue={row.code} required />
                    </div>
                    <div className={styles.field}>
                      <label>Efficiency %</label>
                      <input
                        name="default_efficiency_pct"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={row.default_efficiency_pct}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Rates effective from</label>
                      <input
                        name="effective_from"
                        type="date"
                        defaultValue={rate?.effective_from ?? new Date().toISOString().slice(0, 10)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Labor $/hr</label>
                      <input
                        name="labor_rate_per_hour"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={rate?.labor_rate_per_hour ?? 0}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Admin $/hr</label>
                      <input
                        name="admin_rate_per_hour"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={rate?.admin_rate_per_hour ?? 0}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Electricity $/kWh</label>
                      <input
                        name="electricity_rate_per_kwh"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={rate?.electricity_rate_per_kwh ?? 0}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Gas $/unit</label>
                      <input
                        name="gas_rate_per_unit"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={rate?.gas_rate_per_unit ?? 0}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Overhead $/hr</label>
                      <input
                        name="overhead_rate_per_hour"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={rate?.overhead_rate_per_hour ?? 0}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.subtle}>
                        <input
                          type="checkbox"
                          name="is_active"
                          defaultChecked={row.is_active}
                        />{" "}
                        Active
                      </label>
                    </div>
                    <div className={`${styles.actionsRow} ${styles.spanTwo}`}>
                      <button className={styles.primary} type="submit">
                        Save Department
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
