/**
 * Calculate days of inventory remaining given available stock and daily burn rate.
 *
 * @param onHand - Total units in stock
 * @param reserved - Units reserved for orders
 * @param avgDailyBurn - Average daily consumption rate
 * @returns Days remaining (floored integer) or null if burn rate is invalid
 */
export function calcDaysRemaining(
  onHand: number,
  reserved: number,
  avgDailyBurn: number
): number | null {
  if (!Number.isFinite(avgDailyBurn) || avgDailyBurn <= 0) return null;
  const available = onHand - reserved;
  return Math.max(0, Math.floor(available / avgDailyBurn));
}

/**
 * Calculate inventory turnover ratio (COGS / average inventory value).
 *
 * @param cogs90d - Cost of goods sold over 90 days
 * @param startInventoryValue - Inventory value at period start
 * @param endInventoryValue - Inventory value at period end
 * @returns Turnover ratio rounded to 1 decimal place, or null if no inventory
 */
export function calcTurnoverRatio(
  cogs90d: number,
  startInventoryValue: number,
  endInventoryValue: number
): number | null {
  const avg = (startInventoryValue + endInventoryValue) / 2;
  if (avg <= 0) return null;
  return parseFloat((cogs90d / avg).toFixed(1));
}
