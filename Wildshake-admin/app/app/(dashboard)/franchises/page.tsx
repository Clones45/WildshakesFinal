import { createClient } from '@/lib/supabase/server'
import FranchisesClient from '@/components/FranchisesClient'

export default async function FranchisesPage() {
  const supabase = await createClient()
  const { data: franchises } = await supabase
    .from('franchises')
    .select('*')
    .order('created_at', { ascending: false })

  return <FranchisesClient franchises={franchises || []} />
}
