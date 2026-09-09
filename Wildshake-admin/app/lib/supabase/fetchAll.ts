// The database API returns at most 1,000 rows per request, silently. A month
// at a busy branch is already past that (Gensan: 1,396 sales and 3,173 sale
// lines in August 2026), so a report that reads a period in one request was
// summing only the first 1,000 rows and understating everything on the page.
//
// fetchAll keeps requesting the next page until a short page comes back.
//
// `build` must return a FRESH query each time it is called — Supabase query
// builders are mutable — with every filter applied and a stable `.order()`,
// so pages line up. Do not put `.limit()` on it; the range replaces it.
//
// On an error part-way through, what was fetched so far is returned and the
// error logged, matching how the pages already treated a failed request
// (empty data, no crash) rather than blanking a report over a blip.

interface PageQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

export async function fetchAll<T>(
  build: () => PageQuery<T>,
  { pageSize = 1000, maxPages = 50 }: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
  const rows: T[] = []
  for (let p = 0; p < maxPages; p++) {
    const { data, error } = await build().range(p * pageSize, (p + 1) * pageSize - 1)
    if (error) {
      console.error(`[fetchAll] page ${p + 1} failed after ${rows.length} rows:`, error.message)
      break
    }
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}
