import { createClient } from '@/lib/supabase/server'
import FranchiserTransactionsClient from '@/components/franchiser/FranchiserTransactionsClient'

export default async function FranchiserTransactionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  const { data: branch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('franchise_id', franchiseId)
    .limit(1)
    .single()

  // Last 100 transactions with items
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id, local_ref, total_amount, discount_type, discount_amount,
      payment_method, status, reference_number, table_number,
      created_at, void_reason,
      users(name),
      transaction_items(quantity, unit_price, subtotal, notes, products(name, category))
    `)
    .eq('branch_id', branch?.id || '')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <FranchiserTransactionsClient
      branchName={branch?.name || ''}
      transactions={(transactions || []) as unknown as Parameters<typeof FranchiserTransactionsClient>[0]['transactions']}
    />
  )
}
