import { createClient } from '@/lib/supabase/server'
import FinancialsClient from '../../../components/FinancialsClient'

export default async function FinancialsPage() {
  const supabase = await createClient()

  const [
    { data: transactions },
    { data: branches },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, total_amount, discount_amount, payment_method, status, created_at, branches(name)')
      .eq('status', 'completed')
      .order('created_at', { ascending: false }),
    supabase.from('branches').select('id, name'),
  ])

  return (
    <FinancialsClient
      transactions={(transactions || []) as unknown as Parameters<typeof FinancialsClient>[0]['transactions']}
      branches={branches || []}
    />
  )
}
