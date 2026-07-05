import { requirePanelAccess } from '@/lib/portal/access'
import CommissaryFranchiseesClient from '@/components/commissary/CommissaryFranchiseesClient'

export default async function CommissaryFranchiseesPage() {
  const { supabase, user } = await requirePanelAccess('commissary', 'franchisees')
  const commissaryId = (user?.app_metadata as Record<string, string>)?.commissary_id

  const { data: franchises } = await supabase
    .from('franchises')
    .select('id, name, owner_name, owner_email, region, status, created_at, branches(id, name, location, status, active_device_id)')
    .eq('parent_commissary_id', commissaryId)
    .order('name')

  return (
    <CommissaryFranchiseesClient
      franchises={(franchises || []) as Parameters<typeof CommissaryFranchiseesClient>[0]['franchises']}
      commissaryId={commissaryId}
    />
  )
}
