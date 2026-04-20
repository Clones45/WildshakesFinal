import { createClient } from '@/lib/supabase/server'
import FranchisesClient from '@/components/FranchisesClient'

export default async function FranchisesPage() {
  const supabase = await createClient()

  // Load franchises with their branches so we can show branch/POS status
  const { data: franchises } = await supabase
    .from('franchises')
    .select(`
      id, name, owner_name, owner_email, region, status, created_at,
      branches(id, name, location, status, active_device_id)
    `)
    .order('created_at', { ascending: false })

  return <FranchisesClient franchises={(franchises || []) as Parameters<typeof FranchisesClient>[0]['franchises']} />
}
