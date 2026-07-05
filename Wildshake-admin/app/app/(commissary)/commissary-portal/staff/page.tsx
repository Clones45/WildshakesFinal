import { requireOwner } from '@/lib/portal/access'
import CommissaryStaffClient from '@/components/commissary/CommissaryStaffClient'

export default async function CommissaryStaffPage() {
  const { supabase, user } = await requireOwner()
  const commissaryId = (user?.app_metadata as Record<string, string>)?.commissary_id

  const { data: staff } = await supabase
    .from('users')
    .select('id, name, email, is_active, created_at, has_portal_access, panels')
    .eq('tenant_type', 'commissary')
    .eq('commissary_id', commissaryId)
    .order('name')

  return (
    <CommissaryStaffClient
      staff={(staff || []) as Parameters<typeof CommissaryStaffClient>[0]['staff']}
    />
  )
}
