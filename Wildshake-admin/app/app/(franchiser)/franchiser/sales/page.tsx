import { requirePanelAccess } from '@/lib/portal/access'
import FranchiserSalesClient from '@/components/franchiser/FranchiserSalesClient'

interface PageProps {
  searchParams: Promise<{ month?: string }>
}

/** Today in Manila as YYYY-MM-DD — the branches all trade on Philippine time. */
function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

/** First instant of a month, and of the month after it, both in Manila time. */
function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start: `${y}-${pad(m)}-01T00:00:00+08:00`,
    end: `${nextY}-${pad(nextM)}-01T00:00:00+08:00`,
  }
}

export default async function FranchiserSalesPage({ searchParams }: PageProps) {
  const { supabase, user } = await requirePanelAccess('franchise', 'sales')
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
      : 'My Branch'

  const { month: monthParam } = await searchParams
  const today = manilaToday()
  // Guard the param — it lands straight in a date range
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam ?? '')
    ? (monthParam as string)
    : today.slice(0, 7)
  const { start, end } = monthRange(month)

  const safeBranchIds = branchIds.length > 0 ? branchIds : ['00000000-0000-0000-0000-000000000000']

  const [{ data: transactions }, { data: topItems }] = await Promise.all([
    supabase
      .from('transactions')
      .select('total_amount, discount_amount, payment_method, status, delivery_platform, created_at')
      .in('branch_id', safeBranchIds)
      .eq('status', 'completed')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: true }),

    supabase
      .from('transaction_items')
      .select('quantity, subtotal, cancelled, products(name, category), transactions!inner(branch_id, status, created_at)')
      .in('transactions.branch_id', safeBranchIds)
      .eq('transactions.status', 'completed')
      .gte('transactions.created_at', start)
      .lt('transactions.created_at', end),
  ])

  return (
    <FranchiserSalesClient
      branchName={branchName}
      month={month}
      today={today}
      transactions={(transactions || []) as unknown as Parameters<typeof FranchiserSalesClient>[0]['transactions']}
      topItems={(topItems || []) as unknown as Parameters<typeof FranchiserSalesClient>[0]['topItems']}
    />
  )
}
