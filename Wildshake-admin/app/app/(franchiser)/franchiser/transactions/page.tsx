import { createClient } from '@/lib/supabase/server'
import FranchiserTransactionsClient from '@/components/franchiser/FranchiserTransactionsClient'

export default async function FranchiserTransactionsPage() {
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
      : 'Branch'

  // Last 200 transactions across all branches
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id, local_ref, total_amount, discount_type, discount_amount,
      payment_method, status, reference_number, bank_name, table_number,
      delivery_platform, created_at, void_reason,
      users(name),
      branches(name),
      transaction_items(quantity, unit_price, subtotal, notes, cancelled, products(name, category))
    `)
    .in('branch_id', branchIds.length > 0 ? branchIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <FranchiserTransactionsClient
      branchName={branchName}
      transactions={(transactions || []) as unknown as Parameters<typeof FranchiserTransactionsClient>[0]['transactions']}
    />
  )
}
