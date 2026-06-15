type PageResult<T> = { data: T[] | null; error: unknown };

/**
 * Fetches every row of a Supabase/PostgREST query by paging with `.range()`.
 *
 * PostgREST caps an un-paginated response at `db-max-rows` (1000 by default),
 * and `.limit()` cannot exceed that cap. Any list view that pulls a full table
 * for client-side aggregation must page through it instead, or it silently
 * truncates at 1000 rows. `buildQuery` receives the inclusive `from`/`to`
 * bounds to pass straight to `.range(from, to)`.
 *
 * On error, returns the rows accumulated so far alongside the error so callers
 * can keep their existing error-handling/fallback behaviour.
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) return { data: all, error };

    const batch = data ?? [];
    all.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { data: all, error: null };
}
