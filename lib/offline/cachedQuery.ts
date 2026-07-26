import { getCacheEntry, setCacheEntry } from "@/lib/offline/db";

type QueryResult<T> = { data: T | null; error: any };

// Generalizes the existing `cache` store (built originally for the offline
// write-queue's "local mirror of current state") into a read-through cache:
// every dashboard in this app follows the identical shape — fetch a whole
// table (or a settings/aggregate row) live, then compute summary numbers
// from it client-side. Wrapping each of those fetches with this means the
// same computation just runs against the last-synced copy when offline,
// with zero changes to the summary logic itself.
//
// `fetcher` is typed as PromiseLike, not Promise — Supabase's own query
// builders (`supabase.from(...).select(...)`) are "thenable" (implement
// `.then()`) but aren't full native Promises, so callers can pass one
// directly (`() => supabase.from("classes").select("*")`) without an extra
// `await`/wrapper.
export async function fetchWithCache<T>(
  module: string,
  key: string,
  fetcher: () => PromiseLike<QueryResult<T>>,
  fallback: T
): Promise<{ data: T; fromCache: boolean }> {
  try {
    const { data, error } = await fetcher();
    if (error) throw error;

    const value = (data ?? fallback) as T;
    void setCacheEntry(module, key, value);
    return { data: value, fromCache: false };
  } catch (error) {
    const cached = await getCacheEntry<T>(module, key);
    return { data: cached ?? fallback, fromCache: cached !== null };
  }
}
