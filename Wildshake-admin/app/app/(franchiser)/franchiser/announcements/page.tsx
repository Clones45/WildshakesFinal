import { requirePanelAccess } from '@/lib/portal/access'
import { loadFranchiseAnnouncements } from '@/lib/franchise/portal'
import FranchiserAnnouncementsClient from '@/components/franchiser/FranchiserAnnouncementsClient'

export default async function FranchiserAnnouncementsPage() {
  const { supabase, user } = await requirePanelAccess('franchise', 'announcements')
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  return <FranchiserAnnouncementsClient announcements={await loadFranchiseAnnouncements(supabase, franchiseId)} />
}
