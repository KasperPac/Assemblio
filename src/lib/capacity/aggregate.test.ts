import { describe, expect, it } from "vitest";
import { aggregateCapacityByDepartment, buildCapacityWeekRows } from "./aggregate";

describe("capacity roll-up", () => {
  it("sums available and overtime hours per department", () => {
    const byDept = aggregateCapacityByDepartment([
      { available_hours_net: 38, overtime_hours: 2, staff_member: { department_id: "d1" } },
      { available_hours_net: 30, overtime_hours: 0, staff_member: { department_id: "d1" } },
      { available_hours_net: 20, overtime_hours: 5, staff_member: { department_id: "d2" } },
    ]);

    expect(byDept.get("d1")).toEqual({ availableHours: 68, overtimeHours: 2 });
    expect(byDept.get("d2")).toEqual({ availableHours: 20, overtimeHours: 5 });
  });

  it("accepts an embedded relation as either an object or a single-element array", () => {
    const asObject = aggregateCapacityByDepartment([
      { available_hours_net: 10, overtime_hours: 1, staff_member: { department_id: "d1" } },
    ]);
    const asArray = aggregateCapacityByDepartment([
      { available_hours_net: 10, overtime_hours: 1, staff_member: [{ department_id: "d1" }] },
    ]);

    expect(asArray.get("d1")).toEqual(asObject.get("d1"));
  });

  it("skips staff with no department rather than attributing their hours", () => {
    const byDept = aggregateCapacityByDepartment([
      { available_hours_net: 38, overtime_hours: 0, staff_member: { department_id: null } },
      { available_hours_net: 38, overtime_hours: 0, staff_member: null },
      { available_hours_net: 38, overtime_hours: 0, staff_member: [] },
      { available_hours_net: 10, overtime_hours: 0, staff_member: { department_id: "d1" } },
    ]);

    expect(byDept.size).toBe(1);
    expect(byDept.get("d1")?.availableHours).toBe(10);
  });

  it("treats null hours as zero", () => {
    const byDept = aggregateCapacityByDepartment([
      { available_hours_net: null, overtime_hours: null, staff_member: { department_id: "d1" } },
    ]);

    expect(byDept.get("d1")).toEqual({ availableHours: 0, overtimeHours: 0 });
  });

  it("returns an empty map for no availability rows", () => {
    expect(aggregateCapacityByDepartment([]).size).toBe(0);
  });
});

describe("capacity week rows", () => {
  const base = {
    tenantId: "t1",
    weekStart: "2026-09-07",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };

  it("totals capacity as available + overtime", () => {
    const rows = buildCapacityWeekRows({
      ...base,
      departments: [{ id: "d1" }],
      capacityByDepartment: new Map([["d1", { availableHours: 68, overtimeHours: 4 }]]),
    });

    expect(rows).toEqual([
      {
        tenant_id: "t1",
        department_id: "d1",
        week_start: "2026-09-07",
        available_hours: 68,
        overtime_hours: 4,
        capacity_hours_total: 72,
        updated_at: "2026-09-03T00:00:00.000Z",
      },
    ]);
  });

  it("writes a zero row for a department with nobody rostered", () => {
    // Must still be written: otherwise last week's figure stands and the
    // department looks like it still has capacity it does not have.
    const rows = buildCapacityWeekRows({
      ...base,
      departments: [{ id: "d1" }, { id: "empty" }],
      capacityByDepartment: new Map([["d1", { availableHours: 38, overtimeHours: 0 }]]),
    });

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      department_id: "empty",
      available_hours: 0,
      overtime_hours: 0,
      capacity_hours_total: 0,
    });
  });

  it("ignores capacity for departments that are not active", () => {
    const rows = buildCapacityWeekRows({
      ...base,
      departments: [{ id: "d1" }],
      capacityByDepartment: new Map([
        ["d1", { availableHours: 38, overtimeHours: 0 }],
        ["archived", { availableHours: 99, overtimeHours: 99 }],
      ]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].department_id).toBe("d1");
  });

  it("produces no rows when the tenant has no departments", () => {
    expect(
      buildCapacityWeekRows({ ...base, departments: [], capacityByDepartment: new Map() })
    ).toEqual([]);
  });
});
