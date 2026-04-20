import { createClient } from '@/lib/supabase/server'
import FranchiserSalesClient from '@/components/franchiser/FranchiserSalesClient'

export default async function FranchiserSalesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  const { data: branch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('franchise_id', franchiseId)
    .limit(1)
    .single()

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: transactions }, { data: topItems }] = await Promise.all([
    supabase
      .from('transactions')
      .select('total_amount, discount_amount, payment_method, status, created_at')
      .eq('branch_id', branch?.id || '')
      .eq('status', 'completed')
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: true }),

    supabase
      .from('transaction_items')
      .select('quantity, subtotal, products(name, category), transactions!inner(branch_id, status, created_at)')
      .eq('transactions.branch_id', branch?.id || '')
      .eq('transactions.status', 'completed')
      .gte('transactions.created_at', ninetyDaysAgo),
  ])

  return (
    <FranchiserSalesClient
      branchName={branch?.name || 'My Branch'}
      transactions={(transactions || []) as unknown as Parameters<typeof FranchiserSalesClient>[0]['transactions']}
      topItems={(topItems || []) as unknown as Parameters<typeof FranchiserSalesClient>[0]['topItems']}
    />
  )
}
