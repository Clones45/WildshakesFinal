import { requirePanelAccess } from '@/lib/portal/access'
import { loadFranchiseBranches, loadFranchiseSales } from '@/lib/franchise/portal'
import FranchiserSalesClient from '@/components/franchiser/FranchiserSalesClient'

interface PageProps {
  searchParams: Promise<{ month?: string; day?: string }>
}

export default async function FranchiserSalesPage({ searchParams }: PageProps) {
  const { supabase, user } = await requirePanelAccess('franchise', 'sales')
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  const branches = await loadFranchiseBranches(supabase, franchiseId)
  const props = await loadFranchiseSales(supabase, branches, await searchParams)

  return <FranchiserSalesClient {...props} />
}
