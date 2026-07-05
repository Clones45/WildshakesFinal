import { createClient } from '@/lib/supabase/server'
import { requirePanelAccess } from '@/lib/portal/access'
import FinancialsClient from '../../../components/FinancialsClient'

export default async function FinancialsPage() {
  await requirePanelAccess('master_admin', 'financials')
  const supabase = await createClient()

  // Use a wide date range (365 days) — client-side filtering handles the display window
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: transactions },
    { data: branches },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, total_amount, discount_amount, payment_method, status, created_at, branches(name)')
      .eq('status', 'completed')
      .gte('created_at', oneYearAgo)
      .order('created_at', { ascending: false }),
    supabase.from('branches').select('id, name').eq('status', 'active'),
  ])

  return (
    <FinancialsClient
      transactions={(transactions || []) as unknown as Parameters<typeof FinancialsClient>[0]['transactions']}
      branches={branches || []}
    />
  )
}
