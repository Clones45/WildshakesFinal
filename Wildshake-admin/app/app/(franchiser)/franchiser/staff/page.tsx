import { createClient } from '@/lib/supabase/server'
import FranchiserStaffClient from '@/components/franchiser/FranchiserStaffClient'

export default async function FranchiserStaffPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  // Get all branches (show first branch for POS setup context)
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name')
    .eq('franchise_id', franchiseId)
    .order('name')

  // Use primary branch for context; staff management is per-branch
  const branch = branches?.[0]

  const { data: staff } = await supabase
    .from('users')
    .select('id, name, email, role, pin_code, is_active, created_at')
    .eq('branch_id', branch?.id || '')
    .order('role')
    .order('name')

  return (
    <FranchiserStaffClient
      branchId={branch?.id || ''}
      branchName={branch?.name || 'My Branch'}
      staff={(staff || []) as Parameters<typeof FranchiserStaffClient>[0]['staff']}
    />
  )
}
