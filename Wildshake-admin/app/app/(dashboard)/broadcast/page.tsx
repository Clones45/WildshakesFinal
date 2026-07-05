import { createClient } from '@/lib/supabase/server'
import { requirePanelAccess } from '@/lib/portal/access'
import BroadcastClient from '../../../components/BroadcastClient'

export default async function BroadcastPage() {
  await requirePanelAccess('master_admin', 'broadcast')
  const supabase = await createClient()

  const [
    { data: announcements },
    { data: franchises },
  ] = await Promise.all([
    supabase
      .from('announcements')
      .select('*, franchises(name)')
      .order('created_at', { ascending: false }),
    supabase.from('franchises').select('id, name').eq('status', 'active'),
  ])

  return (
    <BroadcastClient
      announcements={(announcements || []) as unknown as Parameters<typeof BroadcastClient>[0]['announcements']}
      franchises={franchises || []}
    />
  )
}
