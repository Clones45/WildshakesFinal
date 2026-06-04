import { createAdminClient } from '@/lib/supabase/admin'
import FranchisesClient from '@/components/FranchisesClient'

export default async function FranchisesPage() {
  const supabase = createAdminClient()

  const [
    { data: franchises },
    { data: commissaryBranches },
  ] = await Promise.all([
    // Load all franchises with their branches + parent commissary info
    supabase
      .from('franchises')
      .select(`
        id, name, owner_name, owner_email, region, status, created_at, parent_commissary_id,
        branches(id, name, location, status, active_device_id)
      `)
      .order('created_at', { ascending: false }),

    // Load all commissary branches
    supabase
      .from('commissary_branches')
      .select('id, name, contact_email, region, status, created_at')
      .order('name'),
  ])

  return (
    <FranchisesClient
      franchises={(franchises || []) as Parameters<typeof FranchisesClient>[0]['franchises']}
      commissaryBranches={(commissaryBranches || []) as Parameters<typeof FranchisesClient>[0]['commissaryBranches']}
    />
  )
}
