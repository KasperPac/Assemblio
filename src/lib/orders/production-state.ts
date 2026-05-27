// src/lib/orders/production-state.ts
export type ProductionState = "not-started" | "in-progress" | "done" | "cancelled";

export type ProductionInput = {
  orderStatus: string;
  snapshots: Array<{ status: string }>;
  hasAnyActualTime: boolean;
};

export function deriveProductionState(input: ProductionInput): ProductionState {
  if (input.orderStatus === "cancelled") return "cancelled";
  if (input.snapshots.length === 0) return "not-started";
  if (!input.hasAnyActualTime) return "not-started";
  const allCompleted = input.snapshots.every((s) => s.status === "completed");
  return allCompleted ? "done" : "in-progress";
}
