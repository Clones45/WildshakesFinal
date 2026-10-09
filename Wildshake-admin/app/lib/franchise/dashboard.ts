import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { buildStockWatch, COUNT_LOOKBACK_DAYS } from '@/lib/inventory/stockWatch'
import { addToBreakdown } from '@/lib/payments'

/**
 * Everything on a franchise's Dashboard: today's and the week's takings, the payment
 * split, today's top items, the latest sales, the active staff count, and a Stock
 * Watch for each branch.
 *
 * One loader, two callers. The branch owner's portal passes their own session, so
 * the database shows them only their franchise. The head office passes the
 * service-role client and any franchise id. Both get exactly the same picture.
 *
 * Returns null when the franchise has no branch yet.
 */
export type FranchiseDashboardData = NonNullable<Awaited<ReturnType<typeof loadFranchiseDashboard>>>

export async function loadFranchiseDashboard(supabase: SupabaseClient, franchiseId: string) {

  // The branches trade on Philippine time. "Today" starts at midnight in Manila,
  // not on the server's clock (UTC on Vercel, i.e. 8 AM Manila) — otherwise the
  // morning's sales sit under yesterday until 8 AM.
  const manilaDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d)
  const today = new Date(`${manilaDay(new Date())}T00:00:00+08:00`)

  // The chart shows today and the six days before it.
  const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)

  // Stock Watch: today's sheet, the last count inside the look-back window, and the sales since.
  const dayStr = manilaDay(new Date())
  const lookbackFrom = manilaDay(new Date(today.getTime() - COUNT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000))

  // Get ALL branches for this franchise
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, location, active_device_id')
    .eq('franchise_id', franchiseId)
    .order('name')

  if (!branches || branches.length === 0) return null

  const branchIds = branches.map(b => b.id)
  const branch = branches[0]  // primary branch for display purposes

  // Period reads go through fetchAll: the API returns at most 1,000 rows per
  // request, and a week across a franchise's branches can pass that.
  const [
    todayTx,
    weekTx,
    { data: recentTx },
    topItems,
    { data: staffCount },
    { data: invCategories },
    { data: invItems },
    invTags,
    invLogs,
    invLinks,
    { data: invProducts },
  ] = await Promise.all([
    // Today's completed transactions (all branches)
    fetchAll(() => supabase
      .from('transactions')
      .select('total_amount, status, payment_method, split_payments')
      .in('branch_id', branchIds)
      .eq('status', 'completed')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true })),

    // Last 7 days for chart (all branches)
    fetchAll(() => supabase
      .from('transactions')
      .select('total_amount, created_at, status')
      .in('branch_id', branchIds)
      .eq('status', 'completed')
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: true })),

    // Recent transactions with cashier info (all branches)
    supabase
      .from('transactions')
      .select('id, total_amount, status, payment_method, created_at, local_ref, users(name), branches(name)')
      .in('branch_id', branchIds)
      .order('created_at', { ascending: false })
      .limit(15),

    // Top selling items via transaction_items (all branches)
    fetchAll(() => supabase
      .from('transaction_items')
      .select('quantity, unit_price, subtotal, products(name, category), transactions!inner(branch_id, status, created_at)')
      .in('transactions.branch_id', branchIds)
      .eq('transactions.status', 'completed')
      .gte('transactions.created_at', today.toISOString())
      .order('id', { ascending: true })),

    // Active staff count (all branches)
    supabase
      .from('users')
      .select('id', { count: 'exact' })
      .in('branch_id', branchIds)
      .eq('is_active', true),

    // Stock Watch: the sheets, which items each branch sees, a month of counts and use, and recipes
    supabase.from('inventory_categories').select('id, sheet_type'),
    supabase.from('inventory_items').select('id, category_id, name, unit, min_stock_level').eq('is_active', true),
    fetchAll(() => supabase
      .from('inventory_item_tags')
      .select('inventory_item_id, entity_id')
      .eq('entity_type', 'branch')
      .in('entity_id', branchIds)
      .order('id')),
    fetchAll(() => supabase
      .from('daily_inventory_logs')
      .select('branch_id, inventory_item_id, log_date, starting_stock, additional_stock, used_stock')
      .in('branch_id', branchIds)
      .gte('log_date', lookbackFrom)
      .lte('log_date', dayStr)
      .order('id')),
    fetchAll(() => supabase.from('food_item_menu_links').select('inventory_item_id, product_id').order('id')),
    supabase.from('products').select('id, name'),
  ])

  const todayRevenue  = (todayTx || []).reduce((s, t) => s + Number(t.total_amount), 0)
  const todayOrders   = (todayTx || []).length
  const weekRevenue   = (weekTx  || []).reduce((s, t) => s + Number(t.total_amount), 0)
  const voidedToday   = (recentTx || []).filter(t => t.status === 'voided' &&
    new Date(t.created_at) >= today).length

  // Payment breakdown: a split sale is counted part by part (cash to Cash, GCash to GCash)
  const payBreakdown: Record<string, number> = {}
  for (const t of todayTx || []) addToBreakdown(payBreakdown, t)

  // Chart: 7-day revenue, each bar one Manila calendar day
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() - (6 - i) * 24 * 60 * 60 * 1000)
    const dateStr = manilaDay(d)
    const label   = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Manila' })
    const revenue = (weekTx || [])
      .filter(t => manilaDay(new Date(t.created_at)) === dateStr)
      .reduce((s, t) => s + Number(t.total_amount), 0)
    return { label, revenue, isToday: i === 6 }
  })

  // Top items: aggregate by product name
  const itemMap: Record<string, { name: string; category: string; qty: number; revenue: number }> = {}
  for (const row of topItems || []) {
    const prod = row.products as unknown as { name: string; category: string } | null
    if (!prod) continue
    if (!itemMap[prod.name]) itemMap[prod.name] = { name: prod.name, category: prod.category, qty: 0, revenue: 0 }
    itemMap[prod.name].qty     += Number(row.quantity)
    itemMap[prod.name].revenue += Number(row.subtotal)
  }
  const topItemsList = Object.values(itemMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  // Stock Watch, one per branch: only the items tagged to that branch, judged on that branch's counts.
  const taggedTo = new Map<string, Set<string>>()
  for (const t of invTags) {
    const set = taggedTo.get(t.entity_id) ?? new Set<string>()
    set.add(t.inventory_item_id)
    taggedTo.set(t.entity_id, set)
  }
  const stockWatches = branches.map(b => ({
    branchName: b.name as string,
    watch: buildStockWatch({
      day: dayStr,
      items: (invItems ?? []).filter(i => taggedTo.get(b.id)?.has(i.id)),
      categories: invCategories ?? [],
      logs: invLogs.filter(l => l.branch_id === b.id),
      links: invLinks,
      products: invProducts ?? [],
    }),
  }))

  return {
    branch,
    branches,
    todayRevenue, todayOrders, weekRevenue, voidedToday,
    chartData,
    payBreakdown,
    topItemsList,
    recentTx: recentTx || [],
    activeStaff: staffCount?.length || 0,
    stockWatches,
  }
}
