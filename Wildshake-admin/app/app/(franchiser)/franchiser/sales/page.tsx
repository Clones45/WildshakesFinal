import { createClient } from '@/lib/supabase/server'
import FranchiserSalesClient from '@/components/franchiser/FranchiserSalesClient'

export default async function FranchiserSalesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const safeBranchIds = branchIds.length > 0 ? branchIds : ['00000000-0000-0000-0000-000000000000']

  const [{ data: transactions }, { data: topItems }] = await Promise.all([
    supabase
      .from('transactions')
      .select('total_amount, discount_amount, payment_method, status, delivery_platform, created_at')
      .in('branch_id', safeBranchIds)
      .eq('status', 'completed')
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: true }),

    supabase
      .from('transaction_items')
      .select('quantity, subtotal, products(name, category), transactions!inner(branch_id, status, created_at)')
      .in('transactions.branch_id', safeBranchIds)
      .eq('transactions.status', 'completed')
      .gte('transactions.created_at', ninetyDaysAgo),
  ])

  return (
    <FranchiserSalesClient
      branchName={branchName}
      transactions={(transactions || []) as unknown as Parameters<typeof FranchiserSalesClient>[0]['transactions']}
      topItems={(topItems || []) as unknown as Parameters<typeof FranchiserSalesClient>[0]['topItems']}
    />
  )
}
