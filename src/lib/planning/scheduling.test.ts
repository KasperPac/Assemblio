import { describe, expect, it } from "vitest";
import { scheduleJob } from "./scheduling";
import type { BomLaborRow } from "./types";

const base = new Date("2026-05-10T08:00:00Z");

const steps: BomLaborRow[] = [
  {
    id: "a",
    department_id: "dept-weld",
    sequence: 1,
    blocked_by: [],
    operation_name: "Welding",
    setup_hours: 1,
    run_hours_per_unit: 2,
  },
  {
    id: "b",
    department_id: "dept-blast",
    sequence: 2,
    blocked_by: [1],
    operation_name: "Sandblasting",
    setup_hours: 0.5,
    run_hours_per_unit: 1,
  },
  {
    id: "c",
    department_id: "dept-cut",
    sequence: 3,
    blocked_by: [],
    operation_name: "Cutting",
    setup_hours: 0,
    run_hours_per_unit: 1,
  },
];

describe("scheduleJob", () => {
  it("schedules independent steps from startFrom", () => {
    const result = scheduleJob(steps, 2, base);
    const weld = result.find((s) => s.sequence === 1)!;
    const cut = result.find((s) => s.sequence === 3)!;
    expect(weld.scheduledStart).toEqual(base);
    expect(cut.scheduledStart).toEqual(base);
  });

  it("schedules dependent step after its blocker ends", () => {
    const result = scheduleJob(steps, 2, base);
    const weld = result.find((s) => s.sequence === 1)!;
    const blast = result.find((s) => s.sequence === 2)!;
    // weld: setup 1h + run 2h/unit × 2 units = 5h total → ends base + 5h
    expect(blast.scheduledStart).toEqual(weld.scheduledEnd);
  });

  it("sets initialStatus=queued for steps with no blocked_by", () => {
    const result = scheduleJob(steps, 2, base);
    expect(result.find((s) => s.sequence === 1)!.initialStatus).toBe("queued");
    expect(result.find((s) => s.sequence === 3)!.initialStatus).toBe("queued");
  });

  it("sets initialStatus=blocked for steps with blocked_by", () => {
    const result = scheduleJob(steps, 2, base);
    expect(result.find((s) => s.sequence === 2)!.initialStatus).toBe("blocked");
  });
});
