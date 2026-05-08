export type RoutingStepStatus = "blocked" | "queued" | "active" | "complete" | "skipped";

export type BlockedStep = { id: string; sequence: number; blocked_by: number[] };

export type BomLaborRow = {
  id: string;
  department_id: string;
  sequence: number;
  blocked_by: number[];
  operation_name: string;
  setup_hours: number;
  run_hours_per_unit: number;
};

export type ScheduledStep = {
  bomLaborId: string;
  departmentId: string;
  sequence: number;
  blockedBy: number[];
  operationName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  initialStatus: RoutingStepStatus;
};
