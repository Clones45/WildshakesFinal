'use client'

import { useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { X, RefreshCw, Download, AlertCircle, Printer } from 'lucide-react'
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
    const arr = new Uint8Array(24) // 24 bytes = 48 hex chars — shorter = simpler QR
    crypto.getRandomValues(arr)
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

export default function StaffQRModal({ staff, onClose, onTokenUpdated }: StaffQRModalProps) {
    const [token, setToken] = useState(staff.qr_access_token)
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const canvasRef = useRef<HTMLDivElement>(null)

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

    // Download via canvas.toDataURL() — always matches exactly what's displayed
    const handleDownload = () => {
        const canvas = canvasRef.current?.querySelector('canvas')
        if (!canvas) return
        const url = canvas.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = url
        a.download = `${staff.name.replace(/\s+/g, '_')}_AccessQR.png`
        a.click()
    }

    const handlePrint = () => {
        const canvas = canvasRef.current?.querySelector('canvas')
        if (!canvas) return
        const url = canvas.toDataURL('image/png')
        const win = window.open('', '_blank')
        if (!win) return
        win.document.write(`
            <html><head><title>${staff.name} — Access QR</title>
            <style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;gap:12px;}
            img{width:260px;height:260px;} h2{margin:0;font-size:1rem;} p{margin:0;font-size:0.75rem;color:#666;}</style></head>
            <body>
              <h2>${staff.name}</h2>
              <p>${staff.role.charAt(0).toUpperCase() + staff.role.slice(1)} — Wildshakes Nexus POS</p>
              <img src="${url}" />
              <p style="margin-top:8px;font-size:0.65rem;color:#999;">Scan at POS login screen</p>
              <script>window.onload=()=>window.print()</script>
            </body></html>
        `)
        win.document.close()
    }

    const roleLabel = staff.role.charAt(0).toUpperCase() + staff.role.slice(1)
    const roleColor = staff.role === 'manager' ? '#c084fc' : '#4ade80'

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4"
                    style={{ borderBottom: '1px solid var(--border)' }}>
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
                <div className="flex flex-col items-center gap-4 px-6 py-6">
                    {token ? (
                        <>
                            {/* Canvas-based QR — level M is simpler and scans better screen-to-screen */}
                            <div ref={canvasRef} className="p-4 rounded-2xl bg-white shadow-lg">
                                <QRCodeCanvas
                                    value={token}
                                    size={220}
                                    level="M"
                                    marginSize={1}
                                />
                            </div>

                            <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                                Staff scans this at the POS to log in instantly.
                                <br />
                                Keep this private — it grants full {staff.role} access.
                            </p>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                                style={{ background: 'var(--bg-secondary)' }}>
                                <AlertCircle size={28} style={{ color: 'var(--text-muted)' }} />
                            </div>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                No QR code yet.
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
                        {token
                            ? (isRegenerating ? 'Regenerating…' : 'Regenerate')
                            : (isRegenerating ? 'Generating…' : 'Generate QR')}
                    </button>

                    {token && (
                        <>
                            <button
                                onClick={handleDownload}
                                className="btn btn-ghost"
                                title="Download PNG"
                                style={{ padding: '0.5rem 0.75rem' }}
                            >
                                <Download size={16} />
                            </button>
                            <button
                                onClick={handlePrint}
                                className="btn btn-ghost"
                                title="Print QR"
                                style={{ padding: '0.5rem 0.75rem' }}
                            >
                                <Printer size={16} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
