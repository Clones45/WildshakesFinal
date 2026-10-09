'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { releaseBranchDevice } from '@/lib/actions/franchiser'
import { FRANCHISE_TABS, type FranchiseTab } from '@/lib/franchise/tabs'

interface Branch { id: string; name: string; location: string | null; active_device_id: string | null; status: string }
interface Franchise { id: string; name: string; owner_name: string; owner_email: string; region: string | null; status: string }

/**
 * The top of the head office's franchise page: who the franchise is, which of its
 * branches have a POS tablet set up (with a way to free a lost or replaced one), and
 * the tabs, one per screen of the owner's portal. Each tab is a link, so the server
 * loads only the screen being looked at.
 */
export default function FranchiseDetailHeader({ franchise, branches, tab }: { franchise: Franchise; branches: Branch[]; tab: FranchiseTab }) {
  const router = useRouter()
  const [releasing, setReleasing] = useState<string | null>(null)
  const [released, setReleased] = useState<Record<string, boolean>>({})
  const base = `/franchises/${franchise.id}`

  async function release(b: Branch) {
    if (!confirm(`Release the POS tablet of ${b.name}?\n\nThe tablet now set up for this branch stops being its till until it is set up again. Use this when a tablet is lost, replaced or reset.`)) return
    setReleasing(b.id)
    const r = await releaseBranchDevice(b.id)
    setReleasing(null)
    if ('error' in r) { alert(r.error); return }
    setReleased(m => ({ ...m, [b.id]: true }))
    router.refresh()
  }

  return (
    <>
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ margin: 0 }}>{franchise.name}</h1>
            <span className={`badge badge-${franchise.status === 'active' ? 'success' : 'danger'}`}>{franchise.status}</span>
          </div>
          <p className="page-header-subtitle">{franchise.owner_name} · {franchise.owner_email} · {franchise.region || 'No region'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {branches.map(b => {
            const online = !!b.active_device_id && !released[b.id]
            return (
              <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className={`badge ${online ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.72rem' }}
                  title={online ? 'A POS tablet is set up for this branch' : 'No POS tablet set up'}>
                  {online ? '●' : '○'} {b.name}
                </span>
                {online && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }} disabled={releasing === b.id} onClick={() => release(b)}>
                    {releasing === b.id ? 'Releasing…' : 'Release tablet'}
                  </button>
                )}
              </span>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem', overflowX: 'auto' }}>
        {FRANCHISE_TABS.map(t => (
          <Link key={t.id} href={`${base}?tab=${t.id}`} scroll={false}
            style={{
              padding: '0.6rem 1.1rem', whiteSpace: 'nowrap', textDecoration: 'none',
              borderBottom: tab === t.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: tab === t.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontWeight: tab === t.id ? 700 : 400, fontSize: '0.88rem', transition: 'all 0.15s',
            }}
          >{t.label}</Link>
        ))}
      </div>
    </>
  )
}
