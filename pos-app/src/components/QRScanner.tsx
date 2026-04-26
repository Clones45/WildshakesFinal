import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, CameraOff } from 'lucide-react'

interface QRScannerProps {
    onScan: (token: string) => void
    isLoading: boolean
    loginFailed: boolean  // true for one render when login fails → restarts scanner
}

const QR_ELEMENT_ID = 'qr-reader'

const SCANNER_CONFIG = {
    fps: 15,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
    disableFlip: false,
}

export const QRScanner = forwardRef<{ restart: () => void }, QRScannerProps>(
    ({ onScan, isLoading, loginFailed }, ref) => {
        const scannerRef = useRef<Html5Qrcode | null>(null)
        const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'processing' | 'error'>('idle')
        const [errorMsg, setErrorMsg] = useState<string | null>(null)
        const startingRef = useRef(false)   // prevents concurrent startScanner calls

        // ── Stop & clean up ──────────────────────────────────────────────────
        const stopScanner = async () => {
            try {
                if (scannerRef.current?.isScanning) {
                    await scannerRef.current.stop()
                }
                scannerRef.current?.clear()
            } catch { /* ignore */ }
            scannerRef.current = null
        }

        // ── Multi-strategy camera start ───────────────────────────────────────
        const startScanner = async () => {
            if (startingRef.current) return
            startingRef.current = true
            setStatus('starting')
            setErrorMsg(null)

            // Always stop any previous instance first
            await stopScanner()

            try {
                // 1. Pre-check: does the browser support camera APIs at all?
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('Camera API not supported on this browser.')
                }

                // 2. Request permission early so we get a clear error if denied
                await navigator.mediaDevices.getUserMedia({ video: true })

                const html5Qr = new Html5Qrcode(QR_ELEMENT_ID)
                scannerRef.current = html5Qr

                const onSuccess = async (decodedText: string) => {
                    await stopScanner()
                    setStatus('processing')
                    onScan(decodedText)
                }
                const onFrameFailure = () => { /* per-frame miss — ignore */ }

                // Strategy 1: environment (rear) camera
                const tryEnvironment = () =>
                    html5Qr.start(
                        { facingMode: { ideal: 'environment' } },
                        SCANNER_CONFIG,
                        onSuccess,
                        onFrameFailure,
                    )

                // Strategy 2: enumerate all video devices, try each one
                const tryAnyDevice = async () => {
                    const devices = await Html5Qrcode.getCameras()
                    if (!devices || devices.length === 0) {
                        throw new Error('No camera found on this device.')
                    }
                    // Prefer the last device (usually rear on Android tablets)
                    const preferred = devices[devices.length - 1]
                    await html5Qr.start(
                        preferred.id,
                        SCANNER_CONFIG,
                        onSuccess,
                        onFrameFailure,
                    )
                }

                try {
                    await tryEnvironment()
                } catch {
                    // Environment facing failed — fall back to device enumeration
                    await tryAnyDevice()
                }

                setStatus('scanning')
            } catch (err) {
                const raw = err instanceof Error ? err.message : String(err)
                const lower = raw.toLowerCase()

                let friendly: string
                if (lower.includes('permission') || lower.includes('denied') || lower.includes('notallowed')) {
                    friendly = 'Camera permission denied. Please allow camera access in your browser settings and try again.'
                } else if (lower.includes('no camera') || lower.includes('no device') || lower.includes('notfound')) {
                    friendly = 'No camera found on this device.'
                } else if (lower.includes('not supported') || lower.includes('api')) {
                    friendly = 'Camera not supported on this browser. Try Chrome or Safari.'
                } else {
                    friendly = 'Camera unavailable. Tap "Try Again" or use PIN login.'
                }

                setErrorMsg(friendly)
                setStatus('error')
            } finally {
                startingRef.current = false
            }
        }

        // Expose restart() so LoginScreen can call it after failed login
        useImperativeHandle(ref, () => ({ restart: startScanner }))

        // Auto-start on mount
        useEffect(() => {
            startScanner()
            return () => { stopScanner() }
        }, []) // eslint-disable-line react-hooks/exhaustive-deps

        // Restart when login fails (loginFailed pulses true → false)
        useEffect(() => {
            if (loginFailed) startScanner()
        }, [loginFailed]) // eslint-disable-line react-hooks/exhaustive-deps

        return (
            <div className="flex flex-col items-center gap-4">
                {/* Camera viewfinder */}
                <div className="relative w-full max-w-[300px] aspect-square rounded-2xl overflow-hidden bg-brand-950 border border-brand-800 shadow-2xl">
                    <div
                        id={QR_ELEMENT_ID}
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
