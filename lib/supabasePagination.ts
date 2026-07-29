// PostgREST silently caps any unbounded select() at 1000 rows (no error,
// no warning) — a table that grows past that just quietly loses whatever
// didn't fit, and which rows get cut off is arbitrary since no explicit
// order is guaranteed. jsms_report_scores hit exactly this at 1131 rows:
// report cards were missing entire subjects for some students depending on
// where in the table their rows happened to land, even though every score
// had genuinely been saved. Any route reading a whole table with `.select()`
// and no `.range()` is one growth spurt away from the same silent gap.
//
// `buildQuery` must return a FRESH query (with whatever filters the caller
// needs already applied) for the given [from, to] range — it's called
// again for each page since a supabase-js query builder can't be reused
// after being awaited once.
export async function fetchAllRows<T = any>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<{ data: T[]; error: any }> {
  let allRows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) return { data: allRows, error };

    const rows = data || [];
    allRows = allRows.concat(rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { data: allRows, error: null };
}
