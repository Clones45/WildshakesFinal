import { createClient } from '@/lib/supabase/server'
import CommissaryClient from '@/components/CommissaryClient'

export default async function CommissaryPage() {
  const supabase = await createClient()

  const [
    { data: inventory },
    { data: shipments },
    { data: branches },
    { data: ingredients },
  ] = await Promise.all([
    supabase
      .from('inventory')
      .select('id, current_stock, safety_level, ingredients(id, name, unit_of_measure), branches(id, name)')
      .order('current_stock'),
    supabase
      .from('commissary_shipments')
      .select('id, quantity_sent, unit_cost, status, notes, created_at, ingredients(name), branches(name)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('branches').select('id, name').eq('status', 'active'),
    supabase.from('ingredients').select('id, name, unit_of_measure').order('name'),
  ])

  return (
    <CommissaryClient
      inventory={(inventory || []) as unknown as Parameters<typeof CommissaryClient>[0]['inventory']}
      shipments={(shipments || []) as unknown as Parameters<typeof CommissaryClient>[0]['shipments']}
      branches={branches || []}
      ingredients={ingredients || []}
    />
  )
}
