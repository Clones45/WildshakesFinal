import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCartStore } from '../store/cartStore'
import { Minus, Plus, Tag, ShoppingCart, PauseCircle, Clock, MapPin, Pencil, Ban } from 'lucide-react'

interface CartProps {
    onCheckout: () => void
    onDiscount: () => void
    onHold: () => void
    heldCount: number
    onShowPending: () => void
}

export function Cart({ onCheckout, onDiscount, onHold, heldCount, onShowPending }: CartProps) {
    const {
        items, discountType, updateQty, updateNotes, cancelItem,
        subtotal, discountAmount, total,
        resumedHoldId, resumedTableNumber,
    } = useCartStore()

    const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
    const [noteInput, setNoteInput] = useState('')

    const sub = subtotal()
    const disc = discountAmount()
    const tot = total()
    const activeItems = items.filter(i => !i.cancelled)
    const hasItems = activeItems.length > 0

    const handleNoteEdit = (productId: string, currentNote: string) => {
        setEditingNoteId(productId)
        setNoteInput(currentNote || '')
    }

    const handleNoteConfirm = (productId: string) => {
        updateNotes(productId, noteInput.trim())
        setEditingNoteId(null)
        setNoteInput('')
    }


    return (
        <div className="flex flex-col h-full bg-white border-l border-brand-200">
            {/* Cart header */}
            <div className="px-5 py-4 border-b border-brand-200 flex items-center justify-between bg-brand-50">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm border border-brand-200">
                        <ShoppingCart size={18} className="text-brand-500" />
                    </div>
                    <div>
                        <h2 className="font-bold text-surface-800 text-lg leading-none">Current Order</h2>
                        <p className="text-surface-600 text-xs font-semibold uppercase mt-1">
                            {activeItems.length} item{activeItems.length !== 1 ? 's' : ''}
                            {items.length > activeItems.length && (
                                <span className="text-red-400 ml-1">· {items.length - activeItems.length} cancelled</span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Held orders badge button */}
                    <button
                        onClick={onShowPending}
                        className="relative flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-brand-200 hover:bg-amber-50 text-surface-600 hover:text-amber-600 transition-all text-xs font-bold shadow-sm"
                        title="View held orders"
                    >
                        <Clock size={14} />
                        <span>Held</span>
                        {heldCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center shadow-sm border-2 border-white">
                                {heldCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Active resumed-order banner */}
            {resumedHoldId && (
                <div className="px-5 py-2.5 flex items-center gap-2 bg-teal-50 border-b border-teal-200">
                    <MapPin size={14} className="text-teal-600 flex-shrink-0" />
                    <span className="text-teal-700 font-bold text-sm">
                        {resumedTableNumber ? `Table #${resumedTableNumber}` : 'Held Order'}
                    </span>
                    <span className="text-teal-500 text-xs ml-1">— Updating held order</span>
                </div>
            )}

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                <AnimatePresence>
                    {items.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500"
                        >
                            <ShoppingCart size={36} className="opacity-25" />
                            <p className="text-sm font-semibold">Cart is empty</p>
                            <p className="text-xs text-gray-400">Tap a product to add</p>
                        </motion.div>
                    ) : (
                        items.map((item) => (
                            <motion.div
                                key={item.product.id}
                                layout
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20, height: 0 }}
                                className={`card px-4 py-3 transition-all ${
                                    item.cancelled
                                        ? 'opacity-60 bg-red-50/60 border-red-200'
                                        : ''
                                }`}
                            >
                                {/* Main row */}
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-bold text-sm leading-tight truncate ${
                                            item.cancelled
                                                ? 'line-through text-red-400'
                                                : 'text-surface-800'
                                        }`}>
                                            {item.product.name}
                                            {item.variant && (
                                                <span className={`ml-1.5 text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                                                    item.cancelled ? 'bg-red-100 text-red-400' : 'bg-brand-100 text-brand-600'
                                                }`}>
                                                    {item.variant}
                                                </span>
                                            )}
                                        </p>
                                        <p className={`font-medium text-xs ${
                                            item.cancelled ? 'line-through text-red-300' : 'text-surface-500'
                                        }`}>
                                            ₱{(item.overridePrice ?? item.product.price).toFixed(2)} each
                                        </p>
                                    </div>

                                    {/* Qty controls — hidden when cancelled */}
                                    {!item.cancelled ? (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => item.quantity > 1 && updateQty(item.product.id, item.quantity - 1)}
                                                disabled={item.quantity <= 1}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform border ${
                                                    item.quantity <= 1
                                                        ? 'bg-surface-50 border-surface-100 opacity-30 cursor-not-allowed'
                                                        : 'bg-surface-100 border-surface-200 active:scale-90 hover:bg-surface-200'
                                                }`}
                                            >
                                                <Minus size={13} className="text-surface-600" />
                                            </button>
                                            <span className="w-7 text-center font-bold text-surface-800">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQty(item.product.id, item.quantity + 1)}
                                                className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center active:scale-90 transition-transform hover:bg-brand-200 border border-brand-200"
                                            >
                                                <Plus size={13} className="text-brand-600" />
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-100 px-2 py-1 rounded-full border border-red-200">
                                            Cancelled
                                        </span>
                                    )}

                                    <div className="text-right w-16">
                                        <p className={`font-bold text-sm ${
                                            item.cancelled ? 'line-through text-red-300' : 'text-brand-600'
                                        }`}>
                                            ₱{((item.overridePrice ?? item.product.price) * item.quantity).toFixed(2)}
                                        </p>
                                    </div>
                                </div>

                                {/* Cancel button + notes row */}
                                <div className="mt-1.5 flex items-center gap-2">
                                    {/* Notes — only when not cancelled */}
                                    {!item.cancelled && (
                                        <div className="flex-1">
                                            {editingNoteId === item.product.id ? (
                                                <div className="flex gap-1.5 items-center">
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        value={noteInput}
                                                        onChange={e => setNoteInput(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter') handleNoteConfirm(item.product.id) }}
                                                        placeholder="e.g. no sugar, extra ice…"
                                                        maxLength={60}
                                                        className="flex-1 text-xs bg-brand-50 border border-brand-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-400 text-surface-700 placeholder-surface-400"
                                                    />
                                                    <button
                                                        onClick={() => handleNoteConfirm(item.product.id)}
                                                        className="text-xs font-bold text-brand-600 hover:text-brand-800 transition-colors px-1"
                                                    >
                                                        OK
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleNoteEdit(item.product.id, item.notes || '')}
                                                    className="flex items-center gap-1 text-[11px] text-surface-400 hover:text-brand-500 transition-colors"
                                                >
                                                    <Pencil size={10} />
                                                    {item.notes
                                                        ? <span className="text-brand-600 font-semibold italic">{item.notes}</span>
                                                        : <span>Add note</span>
                                                    }
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Cancel / Uncancel toggle */}
                                    <button
                                        onClick={() => cancelItem(item.product.id)}
                                        title={item.cancelled ? 'Restore item' : 'Mark as cancelled (wrong order)'}
                                        className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${
                                            item.cancelled
                                                ? 'bg-green-50 border-green-300 text-green-600 hover:bg-green-100'
                                                : 'bg-red-50 border-red-200 text-red-400 hover:bg-red-100 hover:text-red-600'
                                        }`}
                                    >
                                        <Ban size={10} />
                                        {item.cancelled ? 'Restore' : 'Cancel'}
                                    </button>
                                </div>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>

            {/* Totals */}
            <div className="px-5 py-5 border-t-2 border-brand-200 bg-brand-50/50 space-y-3">
                <div className="flex justify-between text-sm text-surface-600 font-bold">
                    <span>Subtotal</span>
                    <span>₱{sub.toFixed(2)}</span>
                </div>

                {disc > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex justify-between text-sm font-bold"
                    >
                        <span className="text-amber-500 capitalize flex items-center gap-1">
                            <Tag size={13} />
                            {discountType === 'custom' ? 'Custom' : discountType.charAt(0).toUpperCase() + discountType.slice(1)} Discount
                        </span>
                        <span className="text-amber-500">-₱{disc.toFixed(2)}</span>
                    </motion.div>
                )}

                <div className="flex justify-between font-black text-xl pt-2 border-t border-brand-200">
                    <span className="text-surface-800">TOTAL</span>
                    <span className="text-brand-600">₱{tot.toFixed(2)}</span>
                </div>
            </div>

            {/* Action buttons */}
            <div className="px-5 pb-6 pt-2 space-y-3 bg-brand-50/50">
                <div className="flex gap-3">
                    <button
                        onClick={onDiscount}
                        disabled={!hasItems}
                        className="flex-1 btn-ghost flex items-center justify-center gap-2 text-sm disabled:opacity-30 relative group"
                        title="Discount (Shift + D)"
                    >
                        <Tag size={16} />
                        {discountType === 'none' ? 'Discount' : 'Discount ✓'}
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap hidden md:block">Shift + D</span>
                    </button>
                    <button
                        onClick={onHold}
                        disabled={!hasItems}
                        className="flex-1 flex items-center justify-center gap-2 bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-200 font-bold text-sm rounded-full py-4 transition-all active:scale-95 disabled:opacity-30 shadow-sm relative group"
                        title="Save this order and start a new one (Shift + H)"
                    >
                        <PauseCircle size={16} />
                        Hold
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap hidden md:block">Shift + H</span>
                    </button>
                </div>
                <button
                    onClick={onCheckout}
                    disabled={!hasItems}
                    className="w-full btn-teal text-base py-4 flex items-center justify-center gap-2 disabled:opacity-30 relative group"
                    title="Checkout (Shift + C)"
                >
                    <span className="text-xl">₱</span>
                    Checkout — ₱{tot.toFixed(2)}
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap hidden md:block">Shift + C</span>
                </button>
            </div>
        </div>
    )
}
