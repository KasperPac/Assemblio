export type StockStatus = "ok" | "low" | "critical";

export function getStockStatus(available: number, reorderPoint: number): StockStatus {
  if (available <= 0) return "critical";
  if (reorderPoint > 0 && available < reorderPoint) return "low";
  return "ok";
}

/** Returns an error message if the group name is invalid, otherwise null. */
export function validateGroupName(name: string): string | null {
  if (!name.trim()) return "Group name is required.";
  return null;
}
