import { requirePanelAccess } from '@/lib/portal/access'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { manilaDay } from '@/lib/manila'
import { manilaMonthRange, resolvePeriod } from '@/lib/period'
import FranchiserTransactionsClient from '@/components/franchiser/FranchiserTransactionsClient'

interface PageProps {
  searchParams: Promise<{ month?: string; day?: string }>
}

export default async function FranchiserTransactionsPage({ searchParams }: PageProps) {
  const { supabase, user } = await requirePanelAccess('franchise', 'transactions')
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  // Get ALL branches for this franchise
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name')
    .eq('franchise_id', franchiseId)
    .order('name')

  const branchIds = (branches || []).map(b => b.id)
  const branchName = branches && branches.length === 1
    ? branches[0].name
    : branches && branches.length > 1
      ? `${branches.length} branches`
      : 'Branch'
  const safeBranchIds = branchIds.length > 0 ? branchIds : ['00000000-0000-0000-0000-000000000000']

  // Which day or month to open on. The same calendar as the Sales Report and the POS:
  //   nothing in the URL      -> today (the page is a daily check first)
  //   ?month=yyyy-mm&day=...  -> that one day
  //   ?month=yyyy-mm          -> the whole month
  // The values land straight in a date range, so resolvePeriod checks them: a day
  // that is not on the calendar, or anything after today, falls back.
  const { month: monthParam, day: dayParam } = await searchParams
  const today = manilaDay()
  const { month, day } = resolvePeriod(monthParam, dayParam, today)
  const { start, end } = manilaMonthRange(month)

  // Every transaction in the month, newest first. The page narrows to a day in the
  // browser, so moving between days of the month is instant. A whole month at a
  // busy branch is more than the API returns in one request (Gensan: 1,171 sales
  // in Sep 2026), so page through — see fetchAll. The id tiebreak keeps the pages
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
    .in('branch_id', safeBranchIds)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }))

  return (
    // Keyed by month: a change of month arrives as a fresh page, with the search
    // box, the status filter and the open row reset.
    <FranchiserTransactionsClient
      key={month}
      branchName={branchName}
      month={month}
      today={today}
      initialDay={day}
      transactions={transactions as unknown as Parameters<typeof FranchiserTransactionsClient>[0]['transactions']}
    />
  )
}
