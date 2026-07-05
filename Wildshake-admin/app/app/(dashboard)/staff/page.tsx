import { requireOwner } from '@/lib/portal/access'
import AdminStaffClient from '@/components/admin/AdminStaffClient'

export default async function AdminStaffPage() {
  const { supabase } = await requireOwner()

  const { data: staff } = await supabase
    .from('users')
    .select('id, name, email, is_active, created_at, has_portal_access, panels')
    .eq('tenant_type', 'master_admin')
    .order('name')

  return (
    <AdminStaffClient
      staff={(staff || []) as Parameters<typeof AdminStaffClient>[0]['staff']}
    />
  )
}
