import { createClient } from '@/lib/supabase/server'
import FranchiserAnnouncementsClient from '@/components/franchiser/FranchiserAnnouncementsClient'

export default async function FranchiserAnnouncementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  const { data: announcements } = await supabase
    .from('announcements')
    .select('id, title, body, priority, created_at, is_active')
    .or(`target.eq.all,and(target.eq.specific,target_franchise_id.eq.${franchiseId})`)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <FranchiserAnnouncementsClient
      announcements={(announcements || []) as Parameters<typeof FranchiserAnnouncementsClient>[0]['announcements']}
    />
  )
}
