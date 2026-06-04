/** The canonical order date: Shopify processedAt, falling back to createdAt. */
export function resolveOrderDate(
  processedAt: string | null | undefined,
  createdAt: string | null | undefined
): string | null {
  return processedAt ?? createdAt ?? null;
}

/**
 * True when an order should be imported as stats-only: its order date is strictly
 * before the store's cutoff. Unknown date or no cutoff => not historical.
 */
export function isHistoricalOrder(
  orderDate: string | null,
  statsOnlyBefore: string | null | undefined
): boolean {
  if (!statsOnlyBefore || !orderDate) return false;
  return new Date(orderDate).getTime() < new Date(`${statsOnlyBefore}T00:00:00Z`).getTime();
}
