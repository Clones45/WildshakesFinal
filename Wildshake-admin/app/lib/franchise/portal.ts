import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { manilaDay } from '@/lib/manila'
import { manilaMonthRange, resolvePeriod } from '@/lib/period'
import type { Tx as SalesTx, TopItem as SalesTopItem, ShiftRow } from '@/components/franchiser/FranchiserSalesClient'
import type { Tx as TransactionRow } from '@/components/franchiser/FranchiserTransactionsClient'
import type { StaffMember } from '@/components/franchiser/FranchiserStaffClient'
import type { Announcement } from '@/components/franchiser/FranchiserAnnouncementsClient'

/**
 * What each screen of the branch owner's portal needs, loaded one way.
 *
 * The owner's portal calls these with the owner's own session, so the database
 * shows them only their franchise. The head office's franchise page calls the same
 * functions with the service-role client and any franchise id. Both get exactly the
 * same rows and render the same screen, so the two can never drift apart.
 */

export interface FranchiseBranch { id: string; name: string }

/** A franchise with no branch yet: an id no row has, so the filters match nothing. */
const NO_BRANCH = ['00000000-0000-0000-0000-000000000000']
const idsOf = (branches: FranchiseBranch[]) => (branches.length > 0 ? branches.map(b => b.id) : NO_BRANCH)

/** The branch's name, or "2 branches", or the fallback when the franchise has none. */
export function franchiseBranchLabel(branches: FranchiseBranch[], fallback = 'My Branch'): string {
  if (branches.length === 1) return branches[0].name
  if (branches.length > 1) return `${branches.length} branches`
  return fallback
}

export async function loadFranchiseBranches(supabase: SupabaseClient, franchiseId: string) {
  const { data } = await supabase
    .from('branches')
    .select('id, name, location, active_device_id, status')
    .eq('franchise_id', franchiseId)
    .order('name')
  return (data ?? []) as { id: string; name: string; location: string | null; active_device_id: string | null; status: string }[]
}

// ---------------------------------------------------------------------------
// Sales Report: one month at a time, with the day carried in the address
// ---------------------------------------------------------------------------

export async function loadFranchiseSales(
  supabase: SupabaseClient,
  branches: FranchiseBranch[],
  params: { month?: string; day?: string },
) {
  const today = manilaDay()
  // Guard the values: they land straight in a date range.
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? '') ? (params.month as string) : today.slice(0, 7)
  // A picked day rides along in the address so it survives the reload that a change
  // of month causes. Honoured only if it is a real day inside this month that has
  // already happened; otherwise the whole month is shown.
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.day ?? '')
    && (params.day as string).startsWith(`${month}-`)
    && (params.day as string) <= today
    ? (params.day as string)
    : ''
  const { start, end } = manilaMonthRange(month)
  const branchIds = idsOf(branches)

  // A whole month is more than the API returns in one request (Gensan: 1,396
  // sales and 3,173 lines in Aug 2026), so page through: see fetchAll.
  const [transactions, topItems, shifts] = await Promise.all([
    fetchAll(() => supabase
      .from('transactions')
      .select('total_amount, discount_amount, payment_method, status, delivery_platform, created_at')
      .in('branch_id', branchIds)
      .eq('status', 'completed')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: true })),

    fetchAll(() => supabase
      .from('transaction_items')
      .select('quantity, subtotal, cancelled, products(name, category), transactions!inner(branch_id, status, created_at)')
      .in('transactions.branch_id', branchIds)
      .eq('transactions.status', 'completed')
      .gte('transactions.created_at', start)
      .lt('transactions.created_at', end)
      .order('id', { ascending: true })),

    // Every shift opened in the month, newest first. select('*') on purpose: the
    // commission columns arrived with a migration, and naming columns here would
    // fail on a database that has not run it yet.
    fetchAll(() => supabase
      .from('shifts')
      .select('*')
      .in('branch_id', branchIds)
      .gte('opened_at', start)
      .lt('opened_at', end)
      .order('opened_at', { ascending: false })),
  ])

  return {
    branchName: franchiseBranchLabel(branches),
    month,
    today,
    initialDay: day,
    shifts: shifts as unknown as ShiftRow[],
    transactions: transactions as unknown as SalesTx[],
    topItems: topItems as unknown as SalesTopItem[],
  }
}

// ---------------------------------------------------------------------------
// Transaction History: every sale in a month, narrowed to a day in the browser
// ---------------------------------------------------------------------------

export async function loadFranchiseTransactions(
  supabase: SupabaseClient,
  branches: FranchiseBranch[],
  params: { month?: string; day?: string },
) {
  // Which day or month to open on. The same calendar as the Sales Report and the POS:
  //   nothing in the address     -> today (the page is a daily check first)
  //   ?month=yyyy-mm&day=...     -> that one day
  //   ?month=yyyy-mm             -> the whole month
  // The values land straight in a date range, so resolvePeriod checks them: a day
  // that is not on the calendar, or anything after today, falls back.
  const today = manilaDay()
  const { month, day } = resolvePeriod(params.month, params.day, today)
  const { start, end } = manilaMonthRange(month)

  // Every transaction in the month, newest first. The page narrows to a day in the
  // browser, so moving between days of the month is instant. A whole month at a
  // busy branch is more than the API returns in one request (Gensan: 1,171 sales
  // in Sep 2026), so page through: see fetchAll. The id tiebreak keeps the pages
  // lined up when two sales share a timestamp.
  const transactions = await fetchAll(() => supabase
    .from('transactions')
    .select(`
      id, local_ref, total_amount, discount_type, discount_amount,
      payment_method, status, reference_number, bank_name, split_payments, table_number,
      delivery_platform, created_at, void_reason,
      users(name),
      branches(name),
      transaction_items(quantity, unit_price, subtotal, notes, cancelled, products(name, category))
    `)
    .in('branch_id', idsOf(branches))
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }))

  return {
    branchName: franchiseBranchLabel(branches, 'Branch'),
    month,
    today,
    initialDay: day,
    transactions: transactions as unknown as TransactionRow[],
  }
}

// ---------------------------------------------------------------------------
// Staff, POS device, announcements
// ---------------------------------------------------------------------------

/** Staff are franchise-wide, not per branch: portal access is not branch-scoped. */
export async function loadFranchiseStaff(supabase: SupabaseClient, franchiseId: string) {
  const { data } = await supabase
    .from('users')
    .select('id, name, email, role, pin_code, qr_access_token, is_active, created_at, has_portal_access, panels')
    .eq('franchise_id', franchiseId)
    .order('role')
    .order('name')
  return (data ?? []) as StaffMember[]
}

/** When the branch's till last recorded a sale, or null if it never has. */
export async function loadLastPosActivity(supabase: SupabaseClient, branchId: string): Promise<string | null> {
  const { data } = await supabase
    .from('transactions')
    .select('created_at')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.created_at as string | undefined) ?? null
}

/** The notices this franchise sees: everything sent to all, plus those sent to it alone. */
export async function loadFranchiseAnnouncements(supabase: SupabaseClient, franchiseId: string) {
  const { data } = await supabase
    .from('announcements')
    .select('id, title, body, priority, created_at, is_active')
    .or(`target.eq.all,and(target.eq.specific,target_franchise_id.eq.${franchiseId})`)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as Announcement[]
}
