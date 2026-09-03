/**
 * Weekly department capacity roll-up.
 *
 * Extracted from src/app/app/capacity/actions.ts so it can be tested; the
 * action keeps the query, redirect and upsert around it.
 */

/**
 * A staff_availability_week row joined to its staff member.
 *
 * PostgREST returns an embedded to-one relation as an object, but as a
 * single-element array in some shapes, so both are accepted.
 */
export type AvailabilityWithDepartment = {
  available_hours_net: number | null;
  overtime_hours: number | null;
  staff_member:
    | { department_id: string | null }
    | Array<{ department_id: string | null }>
    | null;
};

export type DepartmentCapacity = {
  availableHours: number;
  overtimeHours: number;
};

export type CapacityWeekRow = {
  tenant_id: string;
  department_id: string;
  week_start: string;
  available_hours: number;
  overtime_hours: number;
  capacity_hours_total: number;
  updated_at: string;
};

function departmentIdOf(row: AvailabilityWithDepartment): string | null {
  const relation = Array.isArray(row.staff_member)
    ? row.staff_member[0] ?? null
    : row.staff_member;
  return relation?.department_id ?? null;
}

/**
 * Sum each department's available and overtime hours for the week.
 *
 * Staff with no department are skipped: their hours belong to no capacity
 * line, and attributing them anywhere would overstate that department.
 */
export function aggregateCapacityByDepartment(
  rows: AvailabilityWithDepartment[]
): Map<string, DepartmentCapacity> {
  const capacityByDepartment = new Map<string, DepartmentCapacity>();

  for (const row of rows) {
    const departmentId = departmentIdOf(row);
    if (!departmentId) continue;

    const current = capacityByDepartment.get(departmentId) ?? {
      availableHours: 0,
      overtimeHours: 0,
    };
    current.availableHours += Number(row.available_hours_net ?? 0);
    current.overtimeHours += Number(row.overtime_hours ?? 0);
    capacityByDepartment.set(departmentId, current);
  }

  return capacityByDepartment;
}

/**
 * One row per active department — including departments with no staff
 * rostered, which must still be written as zero so a stale capacity figure
 * from a previous week is overwritten rather than left standing.
 */
export function buildCapacityWeekRows(input: {
  departments: Array<{ id: string }>;
  capacityByDepartment: Map<string, DepartmentCapacity>;
  tenantId: string;
  weekStart: string;
  updatedAt: string;
}): CapacityWeekRow[] {
  return input.departments.map((department) => {
    const totals = input.capacityByDepartment.get(department.id) ?? {
      availableHours: 0,
      overtimeHours: 0,
    };
    return {
      tenant_id: input.tenantId,
      department_id: department.id,
      week_start: input.weekStart,
      available_hours: totals.availableHours,
      overtime_hours: totals.overtimeHours,
      capacity_hours_total: totals.availableHours + totals.overtimeHours,
      updated_at: input.updatedAt,
    };
  });
}
