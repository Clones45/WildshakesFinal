import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CommissarySidebar from '@/components/commissary/CommissarySidebar'

export default async function CommissaryPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.app_metadata as Record<string, string>)?.role
  if (role !== 'commissary') redirect('/unauthorized')

  const commissaryId = (user.app_metadata as Record<string, string>)?.commissary_id

  // Load this commissary branch's info
  const { data: commissary } = await supabase
    .from('commissary_branches')
    .select('id, name, contact_email, region, status')
    .eq('id', commissaryId)
    .single()

  return (
    <div className="dashboard-layout">
      <CommissarySidebar
        userEmail={user.email}
        commissaryName={commissary?.name}
        region={commissary?.region}
      />
      <main className="dashboard-main">
        {children}
      </main>
    </div>
  )
}
