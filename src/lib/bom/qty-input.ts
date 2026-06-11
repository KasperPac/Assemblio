/**
 * Parse raw quantity input text into a positive number.
 * Returns null for empty, non-numeric, zero, or negative input —
 * callers treat null as "not committable yet / revert on blur".
 */
export function parseQtyInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}
