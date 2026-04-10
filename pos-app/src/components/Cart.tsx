import { motion, AnimatePresence } from 'framer-motion'
import { useCartStore } from '../store/cartStore'
import { Minus, Plus, Trash2, Tag, ShoppingCart, PauseCircle, Clock, MapPin } from 'lucide-react'

interface CartProps {
    onCheckout: () => void
    onDiscount: () => void
    onHold: () => void
    heldCount: number
    onShowPending: () => void
}

export function Cart({ onCheckout, onDiscount, onHold, heldCount, onShowPending }: CartProps) {
    const {
        items, discountType, updateQty, removeItem,
        subtotal, discountAmount, total,
        resumedHoldId, resumedTableNumber,
    } = useCartStore()

    const sub = subtotal()
    const disc = discountAmount()
    const tot = total()
    const hasItems = items.length > 0

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
                        <p className="text-surface-600 text-xs font-semibold uppercase mt-1">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>

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

            {/* Active resumed-order banner — table number always visible */}
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
                            className="flex flex-col items-center justify-center h-40 gap-3 text-gray-600"
                        >
                            <ShoppingCart size={36} className="opacity-30" />
                            <p className="text-sm">Cart is empty</p>
                            <p className="text-xs">Tap a product to add</p>
                        </motion.div>
                    ) : (
                        items.map((item) => (
                            <motion.div
                                key={item.product.id}
                                layout
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20, height: 0 }}
                                className="card px-4 py-3 flex items-center gap-3"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-surface-800 font-bold text-sm leading-tight truncate">{item.product.name}</p>
                                    <p className="text-surface-500 font-medium text-xs">₱{item.product.price.toFixed(2)} each</p>
                                </div>

                                {/* Qty controls */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateQty(item.product.id, item.quantity - 1)}
                                        className="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center active:scale-90 transition-transform hover:bg-surface-200 border border-surface-200"
                                    >
                                        {item.quantity === 1 ? <Trash2 size={13} className="text-red-500" /> : <Minus size={13} className="text-surface-600" />}
                                    </button>
                                    <span className="w-7 text-center font-bold text-surface-800">{item.quantity}</span>
                                    <button
                                        onClick={() => updateQty(item.product.id, item.quantity + 1)}
                                        className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center active:scale-90 transition-transform hover:bg-brand-200 border border-brand-200"
                                    >
                                        <Plus size={13} className="text-brand-600" />
                                    </button>
                                </div>

                                <div className="text-right w-20">
                                    <p className="text-brand-600 font-bold text-sm">₱{(item.product.price * item.quantity).toFixed(2)}</p>
                                    <button
                                        onClick={() => removeItem(item.product.id)}
                                        className="text-surface-400 font-medium text-[11px] hover:text-red-500 transition-colors uppercase tracking-widest mt-1"
                                    >
                                        Remove
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
                        className="flex-1 btn-ghost flex items-center justify-center gap-2 text-sm disabled:opacity-30"
                    >
                        <Tag size={16} />
                        {discountType === 'none' ? 'Discount' : 'Discount ✓'}
                    </button>
                    <button
                        onClick={onHold}
                        disabled={!hasItems}
                        className="flex-1 flex items-center justify-center gap-2 bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-200 font-bold text-sm rounded-full py-4 transition-all active:scale-95 disabled:opacity-30 shadow-sm"
                        title="Save this order and start a new one"
                    >
                        <PauseCircle size={16} />
                        Hold
                    </button>
                </div>
                <button
                    onClick={onCheckout}
                    disabled={!hasItems}
                    className="w-full btn-teal text-base py-4 flex items-center justify-center gap-2 disabled:opacity-30"
                >
                    <span className="text-xl">₱</span>
                    Checkout — ₱{tot.toFixed(2)}
                </button>
            </div>
        </div>
    )
}
