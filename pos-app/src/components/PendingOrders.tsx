import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHoldStore, type HeldOrder } from '../store/holdStore'
import { useCartStore } from '../store/cartStore'
import { supabase, type Product } from '../lib/supabase'
import { db } from '../lib/db'
import { printKitchenTicket } from '../lib/printer'
import { BluetoothPrinter } from '@kduma-autoid/capacitor-bluetooth-printer'
import { ManagerPinModal } from './ManagerPinModal'
import { AlertTriangle, Bluetooth, BluetoothSearching, Clock, Loader2, MapPin, RotateCcw, ShieldAlert, X, Printer, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

const BT_PRINTER_KEY = 'nexus_bt_printer_address'
type BTPrinterDevice = { name: string; address: string }

interface PendingOrdersProps {
    isOpen: boolean
    onClose: () => void
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
    })
}

export function PendingOrders({ isOpen, onClose }: PendingOrdersProps) {
    const { heldOrders, isLoading, fetchHeldOrders, voidHeldOrder } = useHoldStore()
    const { addItem, cancelItem, reset, items, setResumedHold } = useCartStore()

    const [confirmResumeId, setConfirmResumeId] = useState<string | null>(null)

    // Void flow state
    const [voidingOrderId, setVoidingOrderId] = useState<string | null>(null)
    const [voidReason, setVoidReason] = useState('')
    const [showVoidPin, setShowVoidPin] = useState(false)

    // ── Bluetooth printer state ───────────────────────────────────────────────
    const [savedPrinter, setSavedPrinter] = useState<string | null>(
        () => localStorage.getItem(BT_PRINTER_KEY)
    )
    const [showBtPicker, setShowBtPicker] = useState(false)
    const [btDevices, setBtDevices] = useState<BTPrinterDevice[]>([])
    const [scanningBt, setScanningBt] = useState(false)
    const [pendingPrintOrder, setPendingPrintOrder] = useState<HeldOrder | null>(null)

    const openBtPicker = async (order: HeldOrder) => {
        setPendingPrintOrder(order)
        setScanningBt(true)
        setShowBtPicker(true)
        try {
            const { devices } = await BluetoothPrinter.list()
            setBtDevices(devices)
        } catch (err: any) {
            const msg: string = err?.message ?? String(err)
            toast.error(`Bluetooth error: ${msg}`, { duration: 6000 })
            setShowBtPicker(false)
        } finally {
            setScanningBt(false)
        }
    }

    const selectBtPrinter = async (device: BTPrinterDevice) => {
        localStorage.setItem(BT_PRINTER_KEY, device.address)
        setSavedPrinter(device.address)
        setShowBtPicker(false)
        toast.success(`Printer set: ${device.name}`)
        // Print the pending order immediately after selecting
        if (pendingPrintOrder) {
            await printKitchenTicket(
                pendingPrintOrder.items,
                pendingPrintOrder.table_number ?? pendingPrintOrder.local_ref,
                pendingPrintOrder.id,
                pendingPrintOrder.created_at
            )
            setPendingPrintOrder(null)
        }
    }

    const handlePrintTicket = async (order: HeldOrder) => {
        if (!savedPrinter) {
            // No printer saved yet — open picker first
            await openBtPicker(order)
        } else {
            // Printer already saved — print directly
            await printKitchenTicket(
                order.items,
                order.table_number ?? order.local_ref,
                order.id,
                order.created_at
            )
        }
    }

    useEffect(() => {
        if (isOpen) fetchHeldOrders()
    }, [isOpen])

    // ── Resume logic ─────────────────────────────────────────────────────────
    const handleResumeRequest = (order: HeldOrder) => {
        if (items.length > 0) {
            setConfirmResumeId(order.id)
        } else {
            doResume(order)
        }
    }

    const doResume = async (order: HeldOrder) => {
        setConfirmResumeId(null)
        try {
            // ── 1. Build the product lookup from local cache ─────────────────
            const cachedProducts = await db.products.toArray()
            const menuLookup = new Map<string, Product>(
                cachedProducts.map((p) => [
                    p.id,
                    {
                        id: p.id,
                        name: p.name,
                        category: p.category,
                        price: p.price,
                        image_url: p.image_url,
                        is_available: p.is_available,
                    },
                ])
            )

            // ── 2. Try to fill missing products from Supabase (safe fallback) ─
            const missingIds = order.items
                .map((i) => i.menu_item_id)
                .filter((id) => !menuLookup.has(id))

            if (missingIds.length > 0 && navigator.onLine) {
                try {
                    const { data: extraProducts } = await supabase
                        .from('products')
                        .select('id, name, category, price, image_url, is_available')
                        .in('id', missingIds)
                    ;(extraProducts ?? []).forEach((p) => {
                        menuLookup.set(p.id, p as Product)
                    })
                } catch {
                    // Non-fatal: fallback product info will be used
                }
            }

            // ── 3. Build the resolved product list BEFORE touching the cart ──
            const toAdd: { product: Product; quantity: number; cancelled: boolean }[] = order.items.map((item) => {
                const cached = menuLookup.get(item.menu_item_id)
                const product: Product = cached ?? {
                    id: item.menu_item_id,
                    name: item.item_name,
                    category: 'Unknown',
                    price: item.unit_price,
                    image_url: null,
                    is_available: true,
                }
                return { product, quantity: item.quantity, cancelled: item.cancelled === true }
            })

            // ── 4. Clear cart then populate atomically ───────────────────────
            reset()
            for (const { product, quantity, cancelled } of toAdd) {
                // Add correct quantity (addItem increments on each call)
                for (let q = 0; q < quantity; q++) {
                    addItem(product)
                }
                // Restore cancelled state — item stays visible as struck-through
                // in the cart until the order is checked out or voided
                if (cancelled) cancelItem(product.id)
            }

            // ── 5. Persist the resumed hold reference ────────────────────────
            const tableNum = order.table_number ?? order.local_ref
            setResumedHold(order.id, order.local_ref, tableNum)
            toast.success('Order resumed — add items then Hold or Checkout', { icon: '▶️', duration: 3000 })
            onClose()
        } catch (err) {
            console.error('Resume order failed', err)
            toast.error('Failed to resume order')
        }
    }

    // ── Void logic ───────────────────────────────────────────────────────────
    const handleVoidClick = (order: HeldOrder) => {
        setVoidingOrderId(order.id)
        setVoidReason('')
        setConfirmResumeId(null)
    }

    const handleVoidAuthorized = async (managerId: string) => {
        if (!voidingOrderId) return
        const reason = voidReason.trim() || 'No reason provided'
        await voidHeldOrder(voidingOrderId, managerId, reason)
        setVoidingOrderId(null)
        setVoidReason('')
    }

    const cancelVoid = () => {
        setVoidingOrderId(null)
        setVoidReason('')
    }

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                        />

                        {/* Drawer */}
                        <motion.div
                            className="fixed top-0 right-0 h-full w-full max-w-sm bg-surface-800 border-l border-surface-600 flex flex-col z-50 shadow-2xl"
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        >
                            {/* Header */}
                            <div className="px-5 py-4 border-b border-surface-600 flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                        <Clock size={16} className="text-amber-400" />
                                    </div>
                                    <div>
                                        <h2 className="font-bold text-white text-base">Held Orders</h2>
                                        <p className="text-gray-500 text-xs">{heldOrders.length} pending</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* BT printer selector button */}
                                    <button
                                        onClick={() => openBtPicker(heldOrders[0] ?? { id: '', items: [], table_number: null, local_ref: '', created_at: new Date().toISOString() } as any)}
                                        title={savedPrinter ? 'Change printer' : 'Select printer'}
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                                            savedPrinter
                                                ? 'bg-teal-500/20 text-teal-400 hover:bg-teal-500/30'
                                                : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                                        }`}
                                    >
                                        <Bluetooth size={15} />
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="w-9 h-9 rounded-xl bg-surface-600 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-500 transition-all"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* BT Printer Picker (inline) */}
                            {showBtPicker && (
                                <div className="px-4 py-3 border-b border-surface-600 bg-surface-700 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white text-sm font-semibold flex items-center gap-2">
                                            <BluetoothSearching size={14} className="text-brand-400" />
                                            Select Printer
                                        </p>
                                        <button
                                            onClick={() => { setShowBtPicker(false); setPendingPrintOrder(null) }}
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
                                            onClick={() => selectBtPrinter(device)}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-600 hover:bg-surface-500 transition-colors text-left"
                                        >
                                            <Bluetooth size={13} className="text-brand-400 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm font-medium truncate">{device.name || 'Unknown Device'}</p>
                                                <p className="text-gray-500 text-xs">{device.address}</p>
                                            </div>
                                            {device.address === savedPrinter && (
                                                <span className="text-teal-400 text-xs font-bold">Active</span>
                                            )}
                                        </button>
                                    ))}
                                    {!savedPrinter && (
                                        <p className="text-amber-400/70 text-xs text-center">
                                            ⚠ Select a printer to enable kitchen ticket printing
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
                                        <Loader2 size={28} className="animate-spin text-amber-500" />
                                        <p className="text-sm">Loading held orders…</p>
                                    </div>
                                ) : heldOrders.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-600">
                                        <Clock size={36} className="opacity-40" />
                                        <p className="text-sm">No orders on hold</p>
                                        <p className="text-xs">Press Hold in the cart to save an order</p>
                                    </div>
                                ) : (
                                    <AnimatePresence>
                                        {heldOrders.map((order) => (
                                            <motion.div
                                                key={order.id}
                                                layout
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, x: 60 }}
                                                className="card p-4 space-y-3"
                                            >
                                                {/* Order meta */}
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        {/* Table number — shown from dedicated field, falls back to local_ref */}
                                                        {(order.table_number ?? order.local_ref) ? (
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <MapPin size={12} className="text-teal-400" />
                                                                <span className="text-teal-400 font-bold text-sm">
                                                                    Table #{order.table_number ?? order.local_ref}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <p className="text-gray-500 text-xs font-mono mb-1">No table assigned</p>
                                                        )}
                                                        <p className="text-gray-500 text-xs font-mono">
                                                            {formatTime(order.created_at)} · #{order.id.slice(-4).toUpperCase()}
                                                        </p>
                                                    </div>
                                                    <span className="text-teal-400 font-bold text-sm">
                                                        ₱{order.total_amount.toFixed(2)}
                                                    </span>
                                                </div>

                                                {/* Item list */}
                                                <ul className="space-y-1">
                                                    {order.items.map((item) => (
                                                        <li key={item.id} className="flex justify-between text-xs">
                                                            <span className={`truncate flex-1 ${item.cancelled ? 'line-through text-red-400/70' : 'text-gray-400'}`}>
                                                                {item.item_name}
                                                                {item.cancelled && (
                                                                    <span className="ml-1 text-red-400/60 not-italic text-[10px]">[cancelled]</span>
                                                                )}
                                                            </span>
                                                            <span className={`ml-2 font-mono ${item.cancelled ? 'text-red-400/50 line-through' : 'text-gray-400'}`}>
                                                                ×{item.quantity}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>

                                                {/* Inline void form */}
                                                {voidingOrderId === order.id && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -6 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-2"
                                                    >
                                                        <div className="flex items-center gap-2 text-red-400 text-xs font-semibold">
                                                            <ShieldAlert size={13} />
                                                            Manager PIN required to delete
                                                        </div>
                                                        <input
                                                            type="text"
                                                            value={voidReason}
                                                            onChange={(e) => setVoidReason(e.target.value)}
                                                            placeholder="Reason for deletion (optional)"
                                                            className="input-field text-xs w-full"
                                                        />
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => setShowVoidPin(true)}
                                                                className="flex-1 bg-red-500 hover:bg-red-400 text-white text-xs font-bold py-1.5 rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                                                            >
                                                                <ShieldAlert size={12} />
                                                                Enter Manager PIN
                                                            </button>
                                                            <button
                                                                onClick={cancelVoid}
                                                                className="flex-1 bg-surface-600 hover:bg-surface-500 text-gray-300 text-xs font-bold py-1.5 rounded-lg transition-all active:scale-95"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                )}

                                                {/* Inline resume confirmation */}
                                                {confirmResumeId === order.id && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -6 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex flex-col gap-2"
                                                    >
                                                        <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                                                            <AlertTriangle size={13} />
                                                            Current cart will be cleared. Continue?
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => doResume(order)}
                                                                className="flex-1 bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold py-1.5 rounded-lg transition-all active:scale-95"
                                                            >
                                                                Yes, Resume
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmResumeId(null)}
                                                                className="flex-1 bg-surface-600 hover:bg-surface-500 text-gray-300 text-xs font-bold py-1.5 rounded-lg transition-all active:scale-95"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                )}

                                                {/* Actions — hidden when any inline form is open for this card */}
                                                {voidingOrderId !== order.id && confirmResumeId !== order.id && (
                                                    <div className="flex gap-2 pt-2">
                                                        <button
                                                            onClick={() => handleResumeRequest(order)}
                                                            className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold text-sm rounded-xl py-2.5 transition-all active:scale-95 shadow-sm"
                                                        >
                                                            <RotateCcw size={14} />
                                                            Resume
                                                        </button>
                                                        <button
                                                            onClick={() => handlePrintTicket(order)}
                                                            className="w-16 flex items-center justify-center gap-1 bg-surface-600 hover:bg-surface-500 text-gray-300 rounded-xl transition-all active:scale-95 text-xs font-semibold"
                                                            title={savedPrinter ? 'Print Kitchen Ticket' : 'Select printer & print'}
                                                        >
                                                            <Printer size={13} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleVoidClick(order)}
                                                            className="w-16 flex items-center justify-center gap-1 bg-surface-600 hover:bg-red-500/20 hover:text-red-400 text-gray-400 rounded-xl transition-all active:scale-95 text-xs font-semibold"
                                                            title="Delete held order (requires manager PIN)"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                )}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Manager PIN Modal for Void authorisation */}
            <ManagerPinModal
                isOpen={showVoidPin}
                title="Void Authorisation"
                onSuccess={(managerId) => {
                    setShowVoidPin(false)
                    handleVoidAuthorized(managerId)
                }}
                onClose={() => setShowVoidPin(false)}
            />
        </>
    )
}
