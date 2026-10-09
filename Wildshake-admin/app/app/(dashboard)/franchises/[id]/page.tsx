import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePanelAccess } from '@/lib/portal/access'
import { manilaDay } from '@/lib/manila'
import { isSheetType } from '@/lib/inventory/sheets'
import { loadBranchSheet } from '@/lib/inventory/loadBranchSheet'
import { loadFranchiseDashboard } from '@/lib/franchise/dashboard'
import {
  loadFranchiseBranches, loadFranchiseSales, loadFranchiseTransactions, loadFranchiseStaff,
  loadLastPosActivity, loadFranchiseAnnouncements, franchiseBranchLabel,
} from '@/lib/franchise/portal'
import { resolveFranchiseTab, type FranchiseTab } from '@/lib/franchise/tabs'
import FranchiseDetailHeader from '@/components/admin/FranchiseDetailHeader'
import MasterBranchSheetClient from '@/components/admin/MasterBranchSheetClient'
import FranchiserDashboardView from '@/components/franchiser/FranchiserDashboardView'
import FranchiserSalesClient from '@/components/franchiser/FranchiserSalesClient'
import FranchiserTransactionsClient from '@/components/franchiser/FranchiserTransactionsClient'
import FranchiserStaffClient from '@/components/franchiser/FranchiserStaffClient'
import FranchiserPosDeviceClient from '@/components/franchiser/FranchiserPosDeviceClient'
import FranchiserAnnouncementsClient from '@/components/franchiser/FranchiserAnnouncementsClient'

export const dynamic = 'force-dynamic'

type Query = Record<string, string | undefined>
type Branches = Awaited<ReturnType<typeof loadFranchiseBranches>>

/**
 * Franchises > one franchise: the head office's window onto that franchise. Each tab
 * is the very screen the franchise owner sees in their own portal, drawn from the
 * same loaders, so the master admin can see (and do) everything the branch can.
 */
export default async function FranchiseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  await requirePanelAccess('master_admin', 'franchises')
  const { id } = await params
  const sp = await searchParams
  const tab = resolveFranchiseTab(sp.tab)
  const admin = createAdminClient()

  const { data: franchise } = await admin
    .from('franchises')
    .select('id, name, owner_name, owner_email, region, status, created_at')
    .eq('id', id.trim())
    .maybeSingle()
  if (!franchise) notFound()

  const branches = await loadFranchiseBranches(admin, franchise.id)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        <Link href="/franchises" style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}>← Franchises</Link>
        <span>/</span>
        <span style={{ color: 'var(--color-text)' }}>{franchise.name}</span>
      </div>

      <FranchiseDetailHeader franchise={franchise} branches={branches} tab={tab} />

      <div className="embedded-panel">
        <TabContent tab={tab} franchiseId={franchise.id} branches={branches} sp={sp} />
      </div>
    </div>
  )
}

async function TabContent({ tab, franchiseId, branches, sp }: { tab: FranchiseTab; franchiseId: string; branches: Branches; sp: Query }) {
  const admin = createAdminClient()
  const base = `/franchises/${franchiseId}`
  const here = `${base}?tab=${tab}`
  const noBranch = <div className="alert alert-warning">This franchise has no branch yet.</div>

  switch (tab) {
    case 'dashboard': {
      const data = await loadFranchiseDashboard(admin, franchiseId)
      if (!data) return noBranch
      return <FranchiserDashboardView data={data} inventoryHref={`${base}?tab=inventory`} />
    }

    case 'sales': {
      const props = await loadFranchiseSales(admin, branches, sp)
      return <FranchiserSalesClient key={props.month} {...props} basePath={here} />
    }

    case 'transactions': {
      const props = await loadFranchiseTransactions(admin, branches, sp)
      // Keyed by month: a change of month arrives as a fresh screen, with the search
      // box, the status filter and the open row reset.
      return <FranchiserTransactionsClient key={props.month} {...props} basePath={here} />
    }

    case 'inventory':
    case 'menu': {
      if (branches.length === 0) return noBranch
      const today = manilaDay()
      const branchId = branches.some(b => b.id === sp.branch) ? (sp.branch as string) : branches[0].id
      const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today
      const sheet = await loadBranchSheet(branchId, day, today)
      return (
        <MasterBranchSheetClient
          key={`${tab}-${branchId}-${day}`}
          embedded
          basePath={here}
          initialSection={tab === 'menu' ? 'menu' : 'sheet'}
          initialSheet={sp.sheet && isSheetType(sp.sheet) ? sp.sheet : undefined}
          initialLowOnly={sp.low === '1'}
          branches={branches.map(b => ({ id: b.id, name: b.name, franchise: null }))}
          branchId={branchId}
          branchName={branches.find(b => b.id === branchId)?.name ?? 'Branch'}
          day={day}
          today={today}
          {...sheet}
        />
      )
    }

    case 'staff': {
      const staff = await loadFranchiseStaff(admin, franchiseId)
      return (
        <FranchiserStaffClient
          branchId={branches[0]?.id ?? ''}
          branchName={franchiseBranchLabel(branches)}
          staff={staff}
          isOwner
        />
      )
    }

    case 'pos_device': {
      if (branches.length === 0) return noBranch
      const devices = await Promise.all(branches.map(async b => ({ branch: b, lastActivityAt: await loadLastPosActivity(admin, b.id) })))
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {devices.map(({ branch, lastActivityAt }) => (
            <FranchiserPosDeviceClient
              key={branch.id}
              branchId={branch.id}
              branchName={branch.name}
              branchLocation={branch.location ?? ''}
              activeDeviceId={branch.active_device_id}
              lastActivityAt={lastActivityAt}
            />
          ))}
        </div>
      )
    }

    case 'announcements': {
      const announcements = await loadFranchiseAnnouncements(admin, franchiseId)
      return (
        <div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            This is what the franchise sees on its Announcements page. To send a new one, go to{' '}
            <Link href="/broadcast" style={{ color: 'var(--color-accent)' }}>Broadcast</Link>.
          </p>
          <FranchiserAnnouncementsClient announcements={announcements} />
        </div>
      )
    }
  }
}
