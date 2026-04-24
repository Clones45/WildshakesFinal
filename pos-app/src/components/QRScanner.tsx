import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, CameraOff } from 'lucide-react'

interface QRScannerProps {
    onScan: (token: string) => void
    isLoading: boolean
    loginFailed: boolean  // true for one render when login fails → restarts scanner
}

export const QRScanner = forwardRef<{ restart: () => void }, QRScannerProps>(
    ({ onScan, isLoading, loginFailed }, ref) => {
        const scannerRef = useRef<Html5Qrcode | null>(null)
        const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'processing' | 'error'>('idle')
        const [errorMsg, setErrorMsg] = useState<string | null>(null)

        const stopScanner = async () => {
            try {
                if (scannerRef.current?.isScanning) {
                    await scannerRef.current.stop()
                    scannerRef.current.clear()
                }
            } catch { /* ignore */ }
            scannerRef.current = null
        }

        const startScanner = async () => {
            if (status === 'scanning' || status === 'starting') return
            setStatus('starting')
            setErrorMsg(null)

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
                    },
                    async (decodedText) => {
                        // Stop camera IMMEDIATELY — prevents repeated scans
                        await stopScanner()
                        setStatus('processing')
                        onScan(decodedText)
                    },
                    () => { /* ignore per-frame failures */ }
                )
                setStatus('scanning')
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Camera unavailable'
                setErrorMsg(msg.toLowerCase().includes('permission')
                    ? 'Camera permission denied. Please allow camera access and try again.'
                    : msg)
                setStatus('error')
            }
        }

        // Expose restart() so LoginScreen can call it when login fails
        useImperativeHandle(ref, () => ({ restart: startScanner }))

        // Auto-start on mount
        useEffect(() => {
            startScanner()
            return () => { stopScanner() }
        }, []) // eslint-disable-line react-hooks/exhaustive-deps

        // If login failed, restart the scanner automatically
        useEffect(() => {
            if (loginFailed) startScanner()
        }, [loginFailed]) // eslint-disable-line react-hooks/exhaustive-deps

        return (
            <div className="flex flex-col items-center gap-4">
                {/* Camera viewfinder */}
                <div className="relative w-full max-w-[300px] aspect-square rounded-2xl overflow-hidden bg-brand-950 border border-brand-800 shadow-2xl">
                    <div
                        id="qr-reader"
                        className="w-full h-full"
                        style={{ position: 'absolute', inset: 0 }}
                    />

                    {/* Scanning overlay — corner brackets */}
                    {status === 'scanning' && (
                        <div className="absolute inset-0 pointer-events-none z-10">
                            <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-gold-400 rounded-tl-md" />
                            <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-gold-400 rounded-tr-md" />
                            <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-gold-400 rounded-bl-md" />
                            <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-gold-400 rounded-br-md" />
                            <div className="absolute left-8 right-8 top-1/2 h-px bg-gold-400/60 animate-pulse" />
                        </div>
                    )}

                    {/* Starting overlay */}
                    {status === 'starting' && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-brand-950/80">
                            <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mb-3" />
                            <p className="text-brand-400 text-xs font-medium">Starting camera…</p>
                        </div>
                    )}

                    {/* Processing overlay — QR detected, waiting for login */}
                    {(status === 'processing' || isLoading) && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-brand-950/85">
                            <div className="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mb-3" />
                            <p className="text-gold-400 text-xs font-semibold">Authenticating…</p>
                        </div>
                    )}

                    {/* Error overlay */}
                    {status === 'error' && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-brand-950/90 gap-3 px-4 text-center">
                            <CameraOff size={28} className="text-red-400" />
                            <p className="text-red-400 text-xs font-semibold">{errorMsg}</p>
                            <button
                                onClick={startScanner}
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
                                onClick={startScanner}
                                className="px-4 py-1.5 rounded-xl bg-brand-800 border border-brand-700 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
                            >
                                Start Camera
                            </button>
                        </div>
                    )}
                </div>

                {status === 'scanning' && (
                    <p className="text-brand-500 text-[11px] font-medium text-center">
                        Hold your QR code steady in front of the camera
                    </p>
                )}
            </div>
        )
    }
)

QRScanner.displayName = 'QRScanner'
