import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, CameraOff } from 'lucide-react'

interface QRScannerProps {
    onScan: (token: string) => void
    isLoading: boolean
}

export function QRScanner({ onScan, isLoading }: QRScannerProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle')
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const hasScanned = useRef(false)

    const startScanner = async () => {
        if (status === 'scanning' || status === 'starting') return
        setStatus('starting')
        setErrorMsg(null)
        hasScanned.current = false

        try {
            const html5Qr = new Html5Qrcode('qr-reader')
            scannerRef.current = html5Qr

            await html5Qr.start(
                { facingMode: 'environment' },
                {
                    fps: 15,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0,
                    disableFlip: false,
                    experimentalFeatures: { useBarCodeDetectorIfSupported: false },
                },
                (decodedText) => {
                    if (hasScanned.current || isLoading) return
                    hasScanned.current = true
                    onScan(decodedText)
                },
                () => { /* ignore scan failures */ }
            )
            setStatus('scanning')
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Camera unavailable'
            setErrorMsg(msg.includes('Permission') ? 'Camera permission denied. Please allow camera access.' : msg)
            setStatus('error')
        }
    }

    const stopScanner = async () => {
        try {
            if (scannerRef.current && scannerRef.current.isScanning) {
                await scannerRef.current.stop()
                scannerRef.current.clear()
            }
        } catch { /* ignore */ }
        scannerRef.current = null
    }

    // Auto-start on mount
    useEffect(() => {
        startScanner()
        return () => { stopScanner() }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Allow re-scanning after a failed attempt
    useEffect(() => {
        if (!isLoading) hasScanned.current = false
    }, [isLoading])

    return (
        <div className="flex flex-col items-center gap-4" ref={containerRef}>
            {/* Camera viewfinder */}
            <div className="relative w-full max-w-[300px] aspect-square rounded-2xl overflow-hidden bg-brand-950 border border-brand-800 shadow-2xl">
                {/* The actual html5-qrcode element */}
                <div
                    id="qr-reader"
                    className="w-full h-full"
                    style={{ position: 'absolute', inset: 0 }}
                />

                {/* Overlay corners */}
                {status === 'scanning' && !isLoading && (
                    <>
                        {/* Corner brackets */}
                        <div className="absolute inset-0 pointer-events-none z-10">
                            {/* TL */}
                            <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-gold-400 rounded-tl-md" />
                            {/* TR */}
                            <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-gold-400 rounded-tr-md" />
                            {/* BL */}
                            <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-gold-400 rounded-bl-md" />
                            {/* BR */}
                            <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-gold-400 rounded-br-md" />
                            {/* Scan line */}
                            <div className="absolute left-8 right-8 top-1/2 h-px bg-gold-400/60 animate-pulse" />
                        </div>
                    </>
                )}

                {/* Starting / loading overlay */}
                {(status === 'starting' || isLoading) && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-brand-950/80">
                        <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-brand-400 text-xs font-medium">
                            {isLoading ? 'Authenticating…' : 'Starting camera…'}
                        </p>
                    </div>
                )}

                {/* Error overlay */}
                {status === 'error' && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-brand-950/90 gap-3 px-4 text-center">
                        <CameraOff size={28} className="text-red-400" />
                        <p className="text-red-400 text-xs font-semibold">{errorMsg}</p>
                        <button
                            onClick={() => startScanner()}
                            className="px-4 py-1.5 rounded-xl bg-brand-800 border border-brand-700 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {/* Idle overlay */}
                {status === 'idle' && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-brand-950/90 gap-3">
                        <Camera size={28} className="text-brand-400" />
                        <button
                            onClick={() => startScanner()}
                            className="px-4 py-1.5 rounded-xl bg-brand-800 border border-brand-700 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
                        >
                            Start Camera
                        </button>
                    </div>
                )}
            </div>

            {status === 'scanning' && !isLoading && (
                <p className="text-brand-500 text-[11px] font-medium text-center">
                    Hold your QR code steady in front of the camera
                </p>
            )}
        </div>
    )
}
