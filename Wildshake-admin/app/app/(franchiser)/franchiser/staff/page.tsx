import { requirePanelAccess } from '@/lib/portal/access'
import { loadFranchiseBranches, loadFranchiseStaff, franchiseBranchLabel } from '@/lib/franchise/portal'
import FranchiserStaffClient from '@/components/franchiser/FranchiserStaffClient'

export default async function FranchiserStaffPage() {
  const { supabase, user, isStaff } = await requirePanelAccess('franchise', 'staff')
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  // The primary branch is the default for new POS staff; the list itself is
  // franchise-wide, since portal access is not branch-scoped.
  const [branches, staff] = await Promise.all([
    loadFranchiseBranches(supabase, franchiseId),
    loadFranchiseStaff(supabase, franchiseId),
  ])

  return (
    <FranchiserStaffClient
      branchId={branches[0]?.id || ''}
      branchName={franchiseBranchLabel(branches)}
      staff={staff}
      isOwner={!isStaff}
    />
  )
}
