import { requirePanelAccess } from '@/lib/portal/access'
import CommissaryReportsClient from '@/components/commissary/CommissaryReportsClient'

export default async function CommissaryReportsPage() {
  const { supabase, user } = await requirePanelAccess('commissary', 'reports')
  const commissaryId = (user?.app_metadata as Record<string, string>)?.commissary_id

  // Load franchisees of this commissary
  const { data: franchises } = await supabase
    .from('franchises')
    .select('id, name')
    .eq('parent_commissary_id', commissaryId)
    .eq('status', 'active')

  const franchiseIds = (franchises || []).map(f => f.id)

  // Load all branches for those franchisees
  const { data: branches } = franchiseIds.length > 0
    ? await supabase
        .from('branches')
        .select('id, name, franchise_id')
        .in('franchise_id', franchiseIds)
    : { data: [] }

  const branchIds = (branches || []).map(b => b.id)

  // Load last 90 days of transactions for those branches
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: transactions } = branchIds.length > 0
    ? await supabase
        .from('transactions')
        .select('id, branch_id, total_amount, discount_amount, payment_method, status, created_at')
        .in('branch_id', branchIds)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000)
    : { data: [] }

  return (
    <CommissaryReportsClient
      franchises={franchises || []}
      branches={branches || []}
      transactions={(transactions || []) as Parameters<typeof CommissaryReportsClient>[0]['transactions']}
    />
  )
}
