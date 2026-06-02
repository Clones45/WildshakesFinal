import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, RotateCcw, AlertTriangle, Printer, Bluetooth, BluetoothSearching, UtensilsCrossed, ShoppingBag } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import type { LocalTransaction } from '../lib/db'
import { BluetoothPrinter } from '@kduma-autoid/capacitor-bluetooth-printer'
import { printReceipt } from '../lib/printer'
import { toast } from 'react-hot-toast'

// ── Bluetooth printer helpers ────────────────────────────────────────────────
const BT_PRINTER_KEY = 'nexus_bt_printer_address'

const isNative = (): boolean =>
    !!(window as any).Capacitor?.isNativePlatform?.()

type BTPrinterDevice = { name: string; address: string }

interface ReceiptModalProps {
    isOpen: boolean
    transaction: LocalTransaction | null
    onClose: () => void
    onVoid: (localRef: string, reason: string) => void
    onNewOrder: () => void
}

export function ReceiptModal({ isOpen, transaction, onVoid, onNewOrder }: ReceiptModalProps) {
    const { user, branch } = useAuthStore()
    const [showVoidPrompt, setShowVoidPrompt] = useState(false)
    const [voidReason, setVoidReason] = useState('')
    const [showPrinterSelector, setShowPrinterSelector] = useState(false)
    const [btDevices, setBtDevices] = useState<BTPrinterDevice[]>([])
    const [savedPrinter, setSavedPrinter] = useState<string | null>(
        () => localStorage.getItem(BT_PRINTER_KEY)
    )
    const [scanningBt, setScanningBt] = useState(false)

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setShowVoidPrompt(false)
            setVoidReason('')
            setShowPrinterSelector(false)
        }
    }, [isOpen])

    const openPrinterSelector = async () => {
        if (!isNative()) {
            toast.error('Bluetooth printing only works in the tablet app.')
            return
        }
        setScanningBt(true)
        setShowPrinterSelector(true)
        try {
            const { devices } = await BluetoothPrinter.list()
            setBtDevices(devices)
        } catch (err: any) {
            const msg: string = err?.message ?? String(err) ?? 'Unknown error'
            console.error('[BT Printer] list() failed:', msg)

            const isPermissionError =
                msg.toLowerCase().includes('permission') ||
                msg.toLowerCase().includes('security') ||
                msg.toLowerCase().includes('access')

            if (isPermissionError) {
                toast.error(
                    '⚠️ Bluetooth permission denied. Go to:\nAndroid Settings → Apps → Wildshakes POS → Permissions → Nearby devices → Allow',
                    { duration: 8000 }
                )
            } else {
                toast.error(`Bluetooth error: ${msg}`, { duration: 6000 })
            }
            setShowPrinterSelector(false)
        } finally {
            setScanningBt(false)
        }
    }

    const selectPrinter = (device: BTPrinterDevice) => {
        localStorage.setItem(BT_PRINTER_KEY, device.address)
        setSavedPrinter(device.address)
        setShowPrinterSelector(false)
        toast.success(`Printer set: ${device.name}`)
    }

    if (!transaction) return null

    const now = new Date(transaction.createdAt)
    const dateStr = now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const paymentLabel = transaction.paymentMethod.replace(/_/g, ' ')
    const orderType = transaction.orderType ?? 'dine-in'
    const deliveryPlatform = (transaction as any).deliveryPlatform as 'foodpanda' | 'grab' | undefined
    const shortRef = transaction.localRef.slice(-8).toUpperCase()

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
                    >
                        {/* ── Success header ── */}
                        <div className="bg-gradient-to-br from-teal-600/20 to-brand-600/20 border-b border-surface-600 px-6 py-5 text-center">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                                className="w-14 h-14 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center mx-auto mb-2"
                            >
                                <CheckCircle size={28} className="text-teal-400" />
                            </motion.div>
                            <h2 className="text-lg font-bold text-white">Payment Complete!</h2>
                            <p className="text-gray-400 text-xs mt-0.5">{branch?.name} · {timeStr}</p>
                        </div>

                        {/* ── Delivery platform banner ── */}
                        {deliveryPlatform === 'foodpanda' && (
                            <div className="flex items-center justify-center gap-2 px-4 py-3 border-b border-surface-600"
                                style={{ background: 'linear-gradient(135deg, rgba(232,0,94,0.25), rgba(232,0,94,0.10))' }}>
                                <span className="text-2xl">🐼</span>
                                <div className="text-center">
                                    <p className="font-extrabold text-sm leading-tight" style={{ color: '#e8005e' }}>FOODPANDA ORDER</p>
                                    <p className="text-xs text-gray-400 leading-tight">Delivery Platform</p>
                                </div>
                                <span className="text-2xl">🐼</span>
                            </div>
                        )}
                        {deliveryPlatform === 'grab' && (
                            <div className="flex items-center justify-center gap-2 px-4 py-3 border-b border-surface-600"
                                style={{ background: 'linear-gradient(135deg, rgba(0,177,79,0.25), rgba(0,177,79,0.10))' }}>
                                <span className="text-2xl">🟢</span>
                                <div className="text-center">
                                    <p className="font-extrabold text-sm leading-tight" style={{ color: '#00b14f' }}>GRAB ORDER</p>
                                    <p className="text-xs text-gray-400 leading-tight">Delivery Platform</p>
                                </div>
                                <span className="text-2xl">🟢</span>
                            </div>
                        )}

                        {/* ── Receipt body — styled like actual thermal receipt ── */}
                        <div className="px-5 py-4 font-mono text-xs max-h-80 overflow-y-auto">

                            {/* Logo area */}
                            <div className="text-center pb-3 border-b border-dashed border-surface-600">
                                <img
                                    src="/wildshakes-logo.png"
                                    alt="Wild Shakes"
                                    className="w-16 h-16 object-contain mx-auto mb-1"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                />
                                <p className="font-bold text-white text-sm">{branch?.name ?? 'Wild Shakes'}</p>
                                {branch?.location && (
                                    <p className="text-gray-400 text-[11px]">{branch.location}</p>
                                )}
                                {branch?.owner_email && (
                                    <p className="text-gray-400 text-[11px]">{branch.owner_email}</p>
                                )}
                                <p className="font-bold text-white text-[11px] mt-1">**TRANSACTION RECEIPT**</p>
                            </div>

                            {/* Employee / POS / Order type */}
                            <div className="py-2 border-b border-dashed border-surface-600 space-y-0.5 text-gray-400">
                                <div className="flex justify-between">
                                    <span>Employee:</span>
                                    <span className="text-white">{user?.name ?? '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>POS:</span>
                                    <span className="text-white">{branch?.name ?? 'POS 1'}</span>
                                </div>
                            </div>

                            {/* Order type badge */}
                            <div className="py-2 border-b border-dashed border-surface-600 text-center">
                                {orderType === 'dine-in' ? (
                                    <span className="inline-flex items-center gap-1.5 text-teal-400 font-bold text-xs">
                                        <UtensilsCrossed size={12} />
                                        Dine-in
                                    </span>
                                ) : orderType === 'take-out' ? (
                                    <span className="inline-flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                                        <ShoppingBag size={12} />
                                        Take-out
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 text-indigo-400 font-bold text-xs">
                                        <ShoppingBag size={12} />
                                        Pickup
                                    </span>
                                )}
                            </div>

                            {/* Ref / Table / Date */}
                            <div className="py-2 border-b border-dashed border-surface-600 space-y-0.5 text-gray-400">
                                <div className="flex justify-between">
                                    <span>Ref#:</span>
                                    <span className="text-white font-bold">{shortRef}</span>
                                </div>
                                {transaction.tableNumber && (
                                    <div className="flex justify-between">
                                        <span>Table:</span>
                                        <span className="text-white">#{transaction.tableNumber}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span>Date:</span>
                                    <span className="text-white">{dateStr}</span>
                                </div>
                            </div>

                            {/* Items */}
                            <div className="py-2 border-b border-dashed border-surface-600 space-y-2">
                                {transaction.items.map((item, i) => {
                                    const isCancelled = !!(item as any).cancelled
                                    return (
                                        <div key={i} className={isCancelled ? 'opacity-50' : ''}>
                                            <div className="flex justify-between">
                                                <span className={`flex-1 ${isCancelled ? 'line-through text-red-400' : 'text-gray-300'}`}>
                                                    {item.productName}
                                                    {isCancelled && <span className="ml-1 text-red-400 text-[10px] not-italic"> [cancelled]</span>}
                                                </span>
                                                <span className={`ml-2 ${isCancelled ? 'line-through text-red-400' : 'text-white'}`}>
                                                    ₱{item.subtotal.toFixed(2)}
                                                </span>
                                            </div>
                                            {/* Qty line below, like the reference photo */}
                                            {!isCancelled && (
                                                <p className="text-gray-500 text-[10px] pl-1">
                                                    {item.quantity}x × ₱{item.unitPrice.toFixed(2)}
                                                </p>
                                            )}
                                            {(item as any).notes && !isCancelled && (
                                                <p className="text-gray-500 text-[10px] italic pl-2">↳ {(item as any).notes}</p>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Totals */}
                            <div className="py-2 border-b border-dashed border-surface-600 space-y-1">
                                <div className="flex justify-between text-gray-400">
                                    <span>Subtotal</span>
                                    <span>₱{(transaction.totalAmount + transaction.discountAmount).toFixed(2)}</span>
                                </div>
                                {transaction.discountAmount > 0 && (
                                    <div className="flex justify-between text-amber-400">
                                        <span className="capitalize">{transaction.discountType} disc.</span>
                                        <span>-₱{transaction.discountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold text-sm border-t border-dashed border-surface-600 pt-1">
                                    <span className="text-white">Total</span>
                                    <span className="text-teal-400">₱{transaction.totalAmount.toFixed(2)}</span>
                                </div>
                                {deliveryPlatform ? (
                                    <div className="flex justify-between text-gray-400">
                                        <span>{deliveryPlatform === 'foodpanda' ? 'Foodpanda Code' : 'Grab Code'}</span>
                                        <span className="text-white font-bold">{transaction.referenceNumber}</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex justify-between text-gray-400">
                                            <span className="capitalize">{paymentLabel}</span>
                                            <span className="text-white">₱{transaction.totalAmount.toFixed(2)}</span>
                                        </div>
                                        {transaction.referenceNumber && (
                                            <div className="flex justify-between text-gray-400">
                                                <span>Ref#</span>
                                                <span className="text-white">{transaction.referenceNumber}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Footer disclaimer */}
                            <div className="pt-2 text-center text-gray-500 text-[10px] leading-tight">
                                ***TRANSACTION RECEIPT ONLY,<br />
                                THIS IS NOT AN OFFICIAL RECEIPT***
                            </div>
                        </div>

                        {/* ── Actions ── */}
                        <div className="px-5 pb-5 pt-3 space-y-2">
                            {showPrinterSelector ? (
                                /* ── Bluetooth Printer Selector ── */
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-white text-sm font-semibold flex items-center gap-2">
                                            <BluetoothSearching size={15} className="text-brand-400" />
                                            Select Printer
                                        </p>
                                        <button
                                            onClick={() => setShowPrinterSelector(false)}
                                            className="text-gray-500 text-xs hover:text-gray-300"
                                        >Cancel</button>
                                    </div>
                                    {scanningBt && (
                                        <p className="text-gray-500 text-xs text-center py-2">Scanning paired devices…</p>
                                    )}
                                    {!scanningBt && btDevices.length === 0 && (
                                        <p className="text-gray-500 text-xs text-center py-2">No paired devices found. Pair the printer in Android Bluetooth settings first.</p>
                                    )}
                                    {btDevices.map(device => (
                                        <button
                                            key={device.address}
                                            onClick={() => selectPrinter(device)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors text-left"
                                        >
                                            <Bluetooth size={15} className="text-brand-400 flex-shrink-0" />
                                            <div>
                                                <p className="text-white text-sm font-medium leading-tight">{device.name || 'Unknown Device'}</p>
                                                <p className="text-gray-500 text-xs">{device.address}</p>
                                            </div>
                                            {device.address === savedPrinter && (
                                                <span className="ml-auto text-teal-400 text-xs font-bold">Active</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ) : showVoidPrompt ? (
                                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Reason for voiding (required)"
                                        value={voidReason}
                                        onChange={e => setVoidReason(e.target.value)}
                                        className="w-full px-3 py-2 bg-surface-900 border border-surface-600 rounded-lg text-white text-sm outline-none focus:border-red-500 transition-colors"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowVoidPrompt(false)}
                                            className="flex-1 py-2 rounded-xl bg-surface-700 text-gray-300 text-sm font-medium hover:bg-surface-600 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            disabled={!voidReason.trim()}
                                            onClick={() => onVoid(transaction.localRef, voidReason.trim())}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                                        >
                                            <AlertTriangle size={14} />
                                            Confirm Void
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Print + BT picker */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => printReceipt(transaction, branch?.name ?? 'Wild Shakes', user?.name ?? 'Staff', branch?.owner_email ?? undefined, branch?.location ?? undefined)}
                                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400 text-sm font-semibold hover:bg-brand-500/20 transition-colors"
                                        >
                                            <Printer size={15} />
                                            Print Receipt
                                        </button>
                                        <button
                                            onClick={openPrinterSelector}
                                            title={savedPrinter ? 'Change printer' : 'Select printer'}
                                            className={`px-3 py-3 rounded-xl border transition-colors ${
                                                savedPrinter
                                                    ? 'bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20'
                                                    : 'bg-surface-700 border-surface-600 text-gray-400 hover:text-brand-400 hover:border-brand-500/50'
                                            }`}
                                        >
                                            <Bluetooth size={15} />
                                        </button>
                                    </div>
                                    {!savedPrinter && (
                                        <p className="text-amber-400/80 text-xs text-center -mt-1">
                                            ⚠ Tap the Bluetooth icon to select a printer first
                                        </p>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowVoidPrompt(true)}
                                            className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
                                        >
                                            <AlertTriangle size={14} />
                                            Void
                                        </button>
                                        <button onClick={onNewOrder} className="btn-teal flex-1 flex items-center justify-center gap-2">
                                            <RotateCcw size={16} />
                                            New Order
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
