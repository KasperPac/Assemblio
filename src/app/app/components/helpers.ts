export type StockStatus = "ok" | "low" | "critical";

export function getStockStatus(available: number, reorderPoint: number): StockStatus {
  if (available <= 0) return "critical";
  if (reorderPoint > 0 && available < reorderPoint) return "low";
  return "ok";
}
