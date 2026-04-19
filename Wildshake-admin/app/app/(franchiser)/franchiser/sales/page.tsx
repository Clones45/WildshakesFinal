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

  // eslint-disable-next-line react-hooks/purity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: transactions }, { data: topItems }] = await Promise.all([
    supabase
      .from('transactions')
      .select('total_amount, discount_amount, payment_method, status, created_at')
      .eq('branch_id', branch?.id || '')
      .eq('status', 'completed')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: true }),

    supabase
      .from('transaction_items')
      .select('quantity, subtotal, products(name, category), transactions!inner(branch_id, status, created_at)')
      .eq('transactions.branch_id', branch?.id || '')
      .eq('transactions.status', 'completed')
      .gte('transactions.created_at', thirtyDaysAgo),
  ])

  return (
    <FranchiserSalesClient
      branchName={branch?.name || ''}
      transactions={(transactions || []) as Parameters<typeof FranchiserSalesClient>[0]['transactions']}
      topItems={(topItems || []) as Parameters<typeof FranchiserSalesClient>[0]['topItems']}
    />
  )
}
