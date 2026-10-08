import { requirePanelAccess } from '@/lib/portal/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadBranchSheet } from '@/lib/inventory/loadBranchSheet'
import { manilaDay } from '@/lib/manila'
import MasterBranchSheetClient from '@/components/admin/MasterBranchSheetClient'

export const dynamic = 'force-dynamic'

export default async function MasterBranchSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; day?: string }>
}) {
  await requirePanelAccess('master_admin', 'inventory')
  const admin = createAdminClient()
  const sp = await searchParams

  const { data: branchRows } = await admin.from('branches').select('id, name, franchises(name)').order('name')
  const branches = (branchRows ?? []).map(b => ({
    id: b.id as string,
    name: b.name as string,
    franchise: ((b as unknown as { franchises: { name: string } | null }).franchises?.name) ?? null,
  }))

  const today = manilaDay()
  const branchId = branches.some(b => b.id === sp.branch) ? (sp.branch as string) : (branches[0]?.id ?? null)
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today

  if (!branchId) {
    return (
      <div>
        <div className="page-header"><div><h1>Branch sheets</h1></div></div>
        <div className="alert alert-warning">No branches exist yet.</div>
      </div>
    )
  }

  const sheet = await loadBranchSheet(branchId, day, today)

  return (
    <MasterBranchSheetClient
      branches={branches}
      branchId={branchId}
      branchName={branches.find(b => b.id === branchId)?.name ?? 'Branch'}
      day={day}
      today={today}
      {...sheet}
    />
  )
}
