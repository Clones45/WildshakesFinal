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

        // ── Camera start (device-ID strategy, most reliable on Android) ─────────
        const startScanner = async () => {
            if (startingRef.current) return
            startingRef.current = true
            setStatus('starting')
            setErrorMsg(null)

            await stopScanner()

            try {
                const html5Qr = new Html5Qrcode(QR_ELEMENT_ID)
                scannerRef.current = html5Qr

                const onSuccess = async (decodedText: string) => {
                    await stopScanner()
                    setStatus('processing')
                    onScan(decodedText)
                }
                const onFrameFailure = () => { /* per-frame miss */ }

                const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
                    Promise.race([
                        p,
                        new Promise<T>((_, rej) =>
                            setTimeout(() => rej(new Error(`Camera timed out after ${ms / 1000}s`)), ms)
                        ),
                    ])

                // Step 1: enumerate cameras (this also triggers the Android permission dialog)
                let devices: { id: string; label: string }[] = []
                try {
                    devices = await withTimeout(Html5Qrcode.getCameras(), 8000)
                } catch {
                    // getCameras() failed — try facingMode as last resort
                }

                if (devices && devices.length > 0) {
                    // Prefer rear camera: look for "back"/"environment" in label, else take last
                    const rear = devices.find(d =>
                        /back|rear|environment/i.test(d.label)
                    ) ?? devices[devices.length - 1]

                    await withTimeout(
                        html5Qr.start(rear.id, SCANNER_CONFIG, onSuccess, onFrameFailure),
                        10000
                    )
                } else {
                    // Fallback: let browser pick via facingMode
                    await withTimeout(
                        html5Qr.start(
                            { facingMode: { ideal: 'environment' } },
                            SCANNER_CONFIG,
                            onSuccess,
                            onFrameFailure,
                        ),
                        10000
                    )
                }

                setStatus('scanning')
            } catch (err) {
                const raw = err instanceof Error ? err.message : String(err)
                const lower = raw.toLowerCase()

                let friendly: string
                if (lower.includes('permission') || lower.includes('denied') || lower.includes('notallowed')) {
                    friendly = 'Camera permission denied. Go to Settings → Apps → Wildshakes POS → Permissions and allow Camera.'
                } else if (lower.includes('no camera') || lower.includes('notfound') || lower.includes('no device')) {
                    friendly = 'No camera found on this device.'
                } else if (lower.includes('timed out')) {
                    friendly = 'Camera took too long to start. Tap "Try Again".'
                } else {
                    friendly = `Camera error: ${raw}`   // show raw error for debugging
                }

                setErrorMsg(friendly)
                setStatus('error')
            } finally {
                startingRef.current = false
            }
        }

        // Expose restart() so LoginScreen can call it after failed login
        useImperativeHandle(ref, () => ({ restart: startScanner }))

        // Auto-start on mount — small delay lets Capacitor bridge finish initializing
        useEffect(() => {
            const t = setTimeout(() => startScanner(), 600)
            return () => {
                clearTimeout(t)
                stopScanner()
            }
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
