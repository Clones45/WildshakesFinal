import { requirePanelAccess } from '@/lib/portal/access'
import FranchiserStaffClient from '@/components/franchiser/FranchiserStaffClient'

export default async function FranchiserStaffPage() {
  const { supabase, user, isStaff } = await requirePanelAccess('franchise', 'staff')
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  // Get all branches (primary branch used as the default for new POS staff)
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name')
    .eq('franchise_id', franchiseId)
    .order('name')

  const branch = branches?.[0]

  // Staff are franchise-wide (not just the primary branch) since portal access
  // isn't branch-scoped -- this also fixes a pre-existing limitation where only
  // the first branch's staff were ever shown.
  const { data: staff } = await supabase
    .from('users')
    .select('id, name, email, role, pin_code, qr_access_token, is_active, created_at, has_portal_access, panels')
    .eq('franchise_id', franchiseId)
    .order('role')
    .order('name')

  return (
    <FranchiserStaffClient
      branchId={branch?.id || ''}
      branchName={branch?.name || 'My Branch'}
      staff={(staff || []) as Parameters<typeof FranchiserStaffClient>[0]['staff']}
      isOwner={!isStaff}
    />
  )
}
