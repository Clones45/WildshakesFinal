import { requirePanelAccess } from '@/lib/portal/access'
import { loadFranchiseBranches, loadFranchiseTransactions } from '@/lib/franchise/portal'
import FranchiserTransactionsClient from '@/components/franchiser/FranchiserTransactionsClient'

interface PageProps {
  searchParams: Promise<{ month?: string; day?: string }>
}

export default async function FranchiserTransactionsPage({ searchParams }: PageProps) {
  const { supabase, user } = await requirePanelAccess('franchise', 'transactions')
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  const branches = await loadFranchiseBranches(supabase, franchiseId)
  const props = await loadFranchiseTransactions(supabase, branches, await searchParams)

  // Keyed by month: a change of month arrives as a fresh page, with the search
  // box, the status filter and the open row reset.
  return <FranchiserTransactionsClient key={props.month} {...props} />
}
