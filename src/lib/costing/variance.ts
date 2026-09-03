/**
 * Planned-vs-actual job cost comparison.
 *
 * Extracted from src/app/app/costing/page.tsx so the number the costing
 * screen is read for can be tested on its own.
 */

export type ActualCostRow = {
  actual_total_cost: number | null;
} | null | undefined;

/**
 * Cost variance for a job: actual minus planned.
 *
 * Positive means it cost MORE than planned (bad); negative means it came in
 * under. Returns null when no actuals have been recorded yet — which is
 * different from a variance of zero, and the screen shows it as "Awaiting
 * actuals" rather than as a job that landed exactly on plan.
 */
export function costVariance(
  plannedTotalCost: number | null | undefined,
  actual: ActualCostRow
): number | null {
  if (!actual) return null;
  return Number(actual.actual_total_cost ?? 0) - Number(plannedTotalCost ?? 0);
}

/**
 * Whether a variance should be flagged as over budget. Only a genuine
 * overspend counts — exactly on plan is not a warning.
 */
export function isOverBudget(variance: number | null): boolean {
  return variance !== null && variance > 0;
}
