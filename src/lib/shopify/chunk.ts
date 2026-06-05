/**
 * Splits an array into batches of at most `size` items. Used to keep PostgREST
 * `.in(...)` filters small: the filter list is serialized into the request URL,
 * so a large list overflows the server's URI length limit (HTTP 414).
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  if (size < 1) return [items];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
