'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, RefreshCw, Download, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface StaffMember {
    id: string
    name: string
    role: string
    qr_access_token: string | null
}

interface StaffQRModalProps {
    staff: StaffMember
    onClose: () => void
    onTokenUpdated: (staffId: string, newToken: string) => void
}

function generateToken(): string {
    // Generate a URL-safe random token (no UUID dependency needed)
    const arr = new Uint8Array(32)
    crypto.getRandomValues(arr)
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

export default function StaffQRModal({ staff, onClose, onTokenUpdated }: StaffQRModalProps) {
    const [token, setToken] = useState(staff.qr_access_token)
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // If no token yet, auto-generate on mount via regenerate flow
    const handleRegenerate = async () => {
        setIsRegenerating(true)
        setError(null)
        const newToken = generateToken()

        const supabase = createClient()
        const { error: err } = await supabase
            .from('users')
            .update({ qr_access_token: newToken })
            .eq('id', staff.id)

        if (err) {
            setError('Failed to regenerate token. Please try again.')
            setIsRegenerating(false)
            return
        }

        setToken(newToken)
        onTokenUpdated(staff.id, newToken)
        setIsRegenerating(false)
    }

    const handleDownload = () => {
        const svg = document.getElementById('staff-qr-svg')
        if (!svg) return
        const svgData = new XMLSerializer().serializeToString(svg)
        const blob = new Blob([svgData], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${staff.name.replace(/\s+/g, '_')}_QR.svg`
        a.click()
        URL.revokeObjectURL(url)
    }

    const roleLabel = staff.role.charAt(0).toUpperCase() + staff.role.slice(1)
    const roleColor = staff.role === 'manager' ? '#c084fc' : '#4ade80'

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                        <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                            Access QR — {staff.name}
                        </h3>
                        <span className="text-xs font-semibold" style={{ color: roleColor }}>
                            {roleLabel}
                        </span>
                    </div>
                    <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '0.25rem' }}>
                        <X size={18} />
                    </button>
                </div>

                {/* QR Body */}
                <div className="flex flex-col items-center gap-5 px-6 py-6">
                    {token ? (
                        <>
                            {/* QR code */}
                            <div className="p-4 rounded-2xl bg-white shadow-lg">
                                <QRCodeSVG
                                    id="staff-qr-svg"
                                    value={token}
                                    size={200}
                                    level="H"
                                    includeMargin={false}
                                    imageSettings={{
                                        src: '/logo.png',
                                        x: undefined,
                                        y: undefined,
                                        height: 36,
                                        width: 36,
                                        excavate: true,
                                    }}
                                />
                            </div>

                            <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                                Staff scans this code at the POS to log in instantly.
                                <br />
                                Keep this private — it grants full {staff.role} access.
                            </p>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-secondary)' }}>
                                <AlertCircle size={28} style={{ color: 'var(--text-muted)' }} />
                            </div>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                No QR code generated yet.
                                <br />
                                Click <strong>Generate QR</strong> to create one.
                            </p>
                        </div>
                    )}

                    {error && (
                        <p className="text-xs text-red-400 text-center font-semibold">{error}</p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 px-6 pb-5">
                    <button
                        onClick={handleRegenerate}
                        disabled={isRegenerating}
                        className="btn btn-secondary flex-1"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={14} className={isRegenerating ? 'animate-spin' : ''} />
                        {token ? (isRegenerating ? 'Regenerating…' : 'Regenerate') : (isRegenerating ? 'Generating…' : 'Generate QR')}
                    </button>

                    {token && (
                        <button
                            onClick={handleDownload}
                            className="btn btn-ghost"
                            title="Download QR as SVG"
                            style={{ padding: '0.5rem 0.75rem' }}
                        >
                            <Download size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
