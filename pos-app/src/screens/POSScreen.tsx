import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import { useSyncStore } from '../store/syncStore'
import { useHoldStore } from '../store/holdStore'
import { useMenuItems } from '../hooks/useMenuItems'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { db, type LocalTransaction } from '../lib/db'
import { logAudit } from '../lib/auditLog'
import { ProductGrid } from '../components/ProductGrid'
import { Cart } from '../components/Cart'
import { CheckoutModal } from '../components/CheckoutModal'
import { DiscountModal } from '../components/DiscountModal'
import { ReceiptModal } from '../components/ReceiptModal'
import { ManagerPinModal } from '../components/ManagerPinModal'
import { SyncStatusBar } from '../components/SyncStatusBar'
import { PendingOrders } from '../components/PendingOrders'
import { HoldModal } from '../components/HoldModal'
import { TransactionsViewGated } from '../components/TransactionsView'
import { LogOut, Clock, ReceiptText, Lock } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'
import { printKitchenTicket } from '../lib/printer'

export function POSScreen() {
    const { user, branch, logoutCashier, releaseDevice } = useAuthStore()
    const {
        items, discountType, discountAmount, total, reset,
        resumedHoldId, resumedHoldRef, resumedTableNumber,
    } = useCartStore()
    const { syncPending, refreshPendingCount } = useSyncStore()
    const { heldOrders, fetchHeldOrders, holdOrder, updateHeldOrder, deleteHeldOrder } = useHoldStore()

    const { products, categories, isLoading, error: menuError, reload: reloadMenu } = useMenuItems()
    useOnlineStatus()

    // Track session start for duration display
    const [sessionStart] = useState(() => Date.now())

    const [showCheckout, setShowCheckout] = useState(false)
    const [showDiscount, setShowDiscount] = useState(false)
    const [showReceipt, setShowReceipt] = useState(false)
    const [showManagerPin, setShowManagerPin] = useState(false)
    const [showPending, setShowPending] = useState(false)
    const [showHoldModal, setShowHoldModal] = useState(false)
    const [showTransactions, setShowTransactions] = useState(false)
    const [managerPinCallback, setManagerPinCallback] = useState<() => void>(() => () => { })
    const [lastTransaction, setLastTransaction] = useState<LocalTransaction | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const [now, setNow] = useState(new Date())

    // Clock (updates every second, also used for session duration)
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(interval)
    }, [])

    // Compute session duration string (e.g. "1h 23m" or "45m")
    const sessionDuration = (() => {
        const diffMs = now.getTime() - sessionStart
        const totalMins = Math.floor(diffMs / 60_000)
        const hours = Math.floor(totalMins / 60)
        const mins = totalMins % 60
        if (hours > 0) return `${hours}h ${mins}m`
        return `${mins}m`
    })()

    // Background sync every 30s
    useEffect(() => {
        const interval = setInterval(syncPending, 30_000)
        return () => clearInterval(interval)
    }, [])

    // Fetch held orders count on mount so the badge shows immediately
    useEffect(() => {
        fetchHeldOrders()
    }, [])

    const requireManager = (callback: () => void) => {
        if (user?.role === 'manager' || user?.role === 'investor') {
            callback()
            return
        }
        setManagerPinCallback(() => callback)
        setShowManagerPin(true)
    }

    // ─── Global Keyboard Shortcuts ──────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only trigger if no modals are open (except for Escape which is handled inside modals usually, but we can do general ones here)
            const isModalOpen = showCheckout || showDiscount || showReceipt || showManagerPin || showPending || showHoldModal || showTransactions;
            
            // Ignore if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (!isModalOpen) {
                if (e.shiftKey && e.key.toLowerCase() === 'c') {
                    e.preventDefault()
                    if (items.length > 0) setShowCheckout(true)
                }
                if (e.shiftKey && e.key.toLowerCase() === 'h') {
                    e.preventDefault()
                    if (items.length > 0) setShowHoldModal(true)
                }
                if (e.shiftKey && e.key.toLowerCase() === 'd') {
                    e.preventDefault()
                    if (items.length > 0) setShowDiscount(true)
                }
                if (e.shiftKey && e.key.toLowerCase() === 'x') {
                    e.preventDefault()
                    if (items.length > 0 && confirm('Clear all items from the cart?')) {
                        reset()
                    }
                }
                if (e.shiftKey && e.key.toLowerCase() === 'f') {
                    e.preventDefault()
                    document.getElementById('product-search-input')?.focus()
                }
            }
        }
        
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [showCheckout, showDiscount, showReceipt, showManagerPin, showPending, showHoldModal, showTransactions, items.length, reset])

    // ─── Hold logic ─────────────────────────────────────────────────────────────
    const handleHoldConfirm = async (tableNumber: string | null, shouldPrint: boolean) => {
        let orderId: string | null
        if (resumedHoldId) {
            orderId = await updateHeldOrder(
                resumedHoldId,
                items,
                tableNumber ?? resumedHoldRef ?? undefined
            )
        } else {
            orderId = await holdOrder(items, tableNumber ?? undefined)
        }
        if (orderId) {
            if (shouldPrint) {
                printKitchenTicket(items, tableNumber ?? resumedHoldRef ?? null, orderId, new Date().toISOString())
            }
            reset()
        }
    }

    // ─── Checkout logic ──────────────────────────────────────────────────────────
    const handleCheckout = async (method: string, tendered: number, refNumber: string, bank: string) => {
        if (items.length === 0) return
        setIsProcessing(true)

        if (discountType === 'manager' && user?.role === 'cashier') {
            setIsProcessing(false)
            requireManager(() => processCheckout(method, tendered, refNumber, bank))
            return
        }

        await processCheckout(method, tendered, refNumber, bank)
    }

    const processCheckout = async (method: string, _tendered: number, refNumber: string, bank: string) => {
        setIsProcessing(true)
        try {
            const localRef = uuidv4()
            const disc = discountAmount()
            const tot = total()
            const createdAt = new Date().toISOString()

            const localTx: LocalTransaction = {
                localRef,
                branchId: branch!.id,
                cashierId: user?.id ?? null,
                totalAmount: tot,
                discountType,
                discountAmount: disc,
                paymentMethod: method,
                referenceNumber: refNumber || undefined,
                bankName: bank || undefined,
                status: 'completed',
                source: 'pos',
                tableNumber: resumedTableNumber ?? undefined,
                items: items.map((i) => ({
                    productId: i.product.id,
                    productName: i.product.name,
                    quantity: i.quantity,
                    unitPrice: i.product.price,
                    subtotal: i.product.price * i.quantity,
                })),
                syncStatus: 'pending',
                createdAt,
            }

            // Write locally first (offline-first)
            await db.transactions.add(localTx)
            setLastTransaction(localTx)
            await refreshPendingCount()

            // Fire-and-forget sync attempt
            syncPending()

            // Log discount to audit_logs if applicable (offline-first)
            if (discountType !== 'none') {
                logAudit({
                    actionType: 'discount',
                    performedBy: user?.id,
                    branchId: branch?.id,
                    referenceTable: 'transactions',
                    notes: `${discountType} discount of ₱${disc.toFixed(2)} on order ${localRef}`,
                    metadata: { discount_type: discountType, discount_amount: disc, total: tot },
                }).catch(console.error)
            }

            // ── If this was a resumed held order, remove it from the hold queue ──
            if (resumedHoldId) {
                await deleteHeldOrder(resumedHoldId)
            }

            reset()
            setShowCheckout(false)
            setShowReceipt(true)
            toast.success('Order saved!', { duration: 2000 })
        } catch (err) {
            toast.error('Failed to save order. Try again.')
            console.error(err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleVoid = (localRef: string, reason: string) => {
        requireManager(async () => {
            await db.transactions.update(localRef, { status: 'voided', syncStatus: 'pending', voidReason: reason })

            logAudit({
                actionType: 'void',
                performedBy: user?.id,
                branchId: branch?.id,
                referenceTable: 'transactions',
                notes: `Transaction ${localRef} voided: ${reason}`,
                metadata: { local_ref: localRef, reason },
            }).catch(console.error)

            toast.success('Transaction voided')
            setShowReceipt(false)
            syncPending()
        })
    }

    const handleNewOrder = () => {
        reset()
        setShowReceipt(false)
        setLastTransaction(null)
    }

    return (
        <div className="fixed inset-0 flex flex-col bg-brand-50">
            {/* Watermark */}
            <div
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 0,
                }}
            >
                <img
                    src="/logo-watermark.png"
                    alt=""
                    style={{ width: 480, height: 480, objectFit: 'contain', opacity: 0.04 }}
                />
            </div>

            {/* Top Bar */}
            <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-brand-200 flex-shrink-0 shadow-sm z-10">
                {/* Left: Logo + Branch */}
                <div className="flex items-center gap-4">
                    <img src="/Logo 1.png" alt="Wildshakes Logo" className="w-12 h-12 object-contain" />
                    <div>
                        <p className="font-serif text-brand-700 text-2xl font-bold leading-none tracking-tight">
                            Wildshakes <span className="text-brand-500 font-sans text-lg uppercase tracking-wider font-bold ml-1">POS</span>
                        </p>
                        <p className="text-surface-600 text-xs leading-tight font-bold mt-1 uppercase tracking-wider">{branch?.name} · {branch?.location}</p>
                    </div>
                </div>

                {/* Center: Clock */}
                <div className="flex items-center gap-2 text-brand-700 text-sm font-bold hidden sm:flex bg-brand-50 px-4 py-2 rounded-full border border-brand-200">
                    <Clock size={16} className="text-brand-500" />
                    <span>{now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span className="text-surface-800 ml-2">{now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>

                {/* Right: Transactions + Sync + User + Logout */}
                <div className="flex items-center gap-3">
                    {/* Transactions button — visible to all; PIN-gated internally for non-managers */}
                    <button
                        onClick={() => setShowTransactions(true)}
                        className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-sm font-bold hover:bg-brand-100 transition-all"
                        title="View Transactions (Manager)"
                    >
                        <ReceiptText size={15} className="text-brand-500" />
                        <span>Transactions</span>
                    </button>

                    <SyncStatusBar />

                    <div className="hidden md:block text-right">
                        <p className="text-surface-800 text-sm font-bold leading-tight">{user?.name}</p>
                        <div className="flex items-center justify-end gap-1.5">
                            <p className="text-brand-500 text-xs font-bold uppercase tracking-wider leading-tight">{user?.role}</p>
                            <span className="text-surface-400 text-[10px]">·</span>
                            <p className="text-surface-500 text-[11px] font-semibold">{sessionDuration}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            requireManager(() => {
                                if (confirm('Are you sure you want to release this device? This will require the owner to log in again.')) {
                                    if (branch) releaseDevice(branch.id)
                                }
                            })
                        }}
                        className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center hover:bg-gold-100 hover:text-gold-600 text-brand-700 transition-all border border-brand-200"
                        title="Release Device (Manager Only)"
                    >
                        <Lock size={18} />
                    </button>
                    <button
                        onClick={logoutCashier}
                        className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center hover:bg-red-100 hover:text-red-600 text-brand-700 transition-all border border-brand-200"
                        title="Sign out Cashier"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </header>

            {/* Main POS Layout — 70/30 split */}
            <div className="flex flex-1 overflow-hidden p-4 gap-4" style={{ position: 'relative', zIndex: 1 }}>
                {/* Product panel (70%) */}
                <div className="flex-1 overflow-hidden bg-white rounded-3xl shadow-sm border border-brand-200">
                    <ProductGrid products={products} categories={categories} isLoading={isLoading} menuError={menuError} onReload={reloadMenu} />
                </div>

                {/* Cart panel (30%) */}
                <div className="w-80 xl:w-96 flex-shrink-0 bg-white rounded-3xl shadow-sm border border-brand-200 overflow-hidden">
                    <Cart
                        onCheckout={() => setShowCheckout(true)}
                        onDiscount={() => setShowDiscount(true)}
                        onHold={() => setShowHoldModal(true)}
                        heldCount={heldOrders.length}
                        onShowPending={() => setShowPending(true)}
                    />
                </div>
            </div>

            {/* ── Modals & Drawers ── */}
            <CheckoutModal
                isOpen={showCheckout}
                onClose={() => setShowCheckout(false)}
                onConfirm={handleCheckout}
                isProcessing={isProcessing}
            />

            <DiscountModal
                isOpen={showDiscount}
                onClose={() => setShowDiscount(false)}
            />

            <ReceiptModal
                isOpen={showReceipt}
                transaction={lastTransaction}
                onClose={() => setShowReceipt(false)}
                onVoid={handleVoid}
                onNewOrder={handleNewOrder}
            />

            <ManagerPinModal
                isOpen={showManagerPin}
                title="Manager Authorization"
                onSuccess={() => managerPinCallback()}
                onClose={() => setShowManagerPin(false)}
            />

            <HoldModal
                isOpen={showHoldModal}
                itemCount={items.length}
                initialTableNumber={resumedTableNumber}
                onConfirm={handleHoldConfirm}
                onClose={() => setShowHoldModal(false)}
            />

            <PendingOrders
                isOpen={showPending}
                onClose={() => setShowPending(false)}
            />

            {/* Manager-gated Transactions view */}
            <TransactionsViewGated
                isOpen={showTransactions}
                onClose={() => setShowTransactions(false)}
            />
        </div>
    )
}
