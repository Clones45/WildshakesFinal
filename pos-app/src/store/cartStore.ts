import { create } from 'zustand'
import { toast } from 'react-hot-toast'
import type { Product } from '../lib/supabase'

export interface CartItem {
    product: Product
    quantity: number
    notes?: string        // e.g. "no sugar", "extra ice"
    cancelled?: boolean   // Struck-through — saved for records but excluded from total/print
    variant?: string      // e.g. "Grande · Regular Pearls", "Hot", "Cold"
    overridePrice?: number // Used when an add-on changes the effective price (e.g. +₱25 for Add-on Pearls)
}

export type DiscountType = 'none' | 'senior' | 'pwd' | 'manager' | 'custom'

// Cart lines are keyed by product + variant (same rule addItem uses to stack items)
export const cartItemKey = (i: CartItem) => `${i.product.id}::${i.variant ?? ''}`

// ─── Stock ceiling ────────────────────────────────────────────────────────────
// When a branch has put a count on a menu item, the cart must not exceed it. The
// same product can sit on several lines (different sizes or flavours), so the
// ceiling applies to the total across all of them, not line by line.

/** How many of this product are already in the cart, ignoring the given line. */
function qtyInCart(items: CartItem[], productId: string, exceptKey?: string): number {
    return items
        .filter(i => i.product.id === productId && !i.cancelled && cartItemKey(i) !== exceptKey)
        .reduce((sum, i) => sum + i.quantity, 0)
}

/** The branch's remaining count, or null when the item is not tracked. */
function stockCap(product: Product): number | null {
    const q = product.stock_qty
    return q === null || q === undefined ? null : q
}
export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'card' | 'other'

const DISCOUNT_RATES: Record<DiscountType, number> = {
    none: 0,
    senior: 0.20,
    pwd: 0.20,
    manager: 0.15,
    custom: 0,
}

interface CartState {
    items: CartItem[]
    discountType: DiscountType
    customDiscountAmount: number
    // Which units the discount covers, per cart line (key → number of units).
    // null = whole order (also covers items added later). Per-unit matters for
    // stacked lines: "Carbonara x3" where only the senior's 1 cup is discounted.
    discountUnits: Record<string, number> | null
    paymentMethod: PaymentMethod
    cashTendered: number
    referenceNumber: string        // Last 6 digits for GCash/Maya, 5 for Bank Transfer
    bankName: string               // Selected bank for bank_transfer (e.g. BDO, BPI)

    // Computed getters
    subtotal: () => number
    discountAmount: () => number
    total: () => number
    change: () => number

    // Resumed hold tracking
    resumedHoldId: string | null
    resumedHoldRef: string | null
    resumedTableNumber: string | null

    // Actions
    addItem: (product: Product, variant?: string, overridePrice?: number) => void
    removeItem: (productId: string) => void
    updateQty: (productId: string, qty: number) => void
    updateNotes: (productId: string, notes: string) => void
    cancelItem: (productId: string) => void   // Toggle strikethrough on item
    setDiscount: (type: DiscountType, customAmount?: number, units?: Record<string, number> | null) => void
    setPaymentMethod: (method: PaymentMethod) => void
    setCashTendered: (amount: number) => void
    setReferenceNumber: (ref: string) => void
    setBankName: (bank: string) => void
    setResumedHold: (id: string | null, ref: string | null, tableNumber?: string | null) => void
    setDeliveryPlatform: (platform: 'foodpanda' | 'grab' | null) => void
    deliveryPlatform: 'foodpanda' | 'grab' | null
    reset: () => void
    clearCart: () => void  // Clear items only (keep discount/payment settings)
}

const initialState = {
    items: [] as CartItem[],
    discountType: 'none' as DiscountType,
    customDiscountAmount: 0,
    discountUnits: null as Record<string, number> | null,
    paymentMethod: 'cash' as PaymentMethod,
    cashTendered: 0,
    referenceNumber: '',
    bankName: '',
    resumedHoldId: null as string | null,
    resumedHoldRef: null as string | null,
    resumedTableNumber: null as string | null,
    deliveryPlatform: null as 'foodpanda' | 'grab' | null,
}

export const useCartStore = create<CartState>()((set, get) => ({
    ...initialState,

    subtotal: () => get().items.filter(i => !i.cancelled).reduce((sum, i) => sum + (i.overridePrice ?? i.product.price) * i.quantity, 0),

    discountAmount: () => {
        const { discountType, customDiscountAmount, discountUnits, items } = get()
        if (discountType === 'custom') return customDiscountAmount
        const rate = DISCOUNT_RATES[discountType]
        if (rate === 0) return 0
        const active = items.filter(i => !i.cancelled)
        if (discountUnits === null) {
            // Whole order
            return active.reduce((sum, i) => sum + (i.overridePrice ?? i.product.price) * i.quantity, 0) * rate
        }
        // Only the selected units of each line (capped at the line's current qty)
        return active.reduce((sum, i) => {
            const units = Math.min(discountUnits[cartItemKey(i)] ?? 0, i.quantity)
            return sum + (i.overridePrice ?? i.product.price) * units
        }, 0) * rate
    },

    total: () => Math.max(0, get().subtotal() - get().discountAmount()),

    change: () => Math.max(0, get().cashTendered - get().total()),

    addItem: (product, variant, overridePrice) =>
        set((state) => {
            // Never let the cart hold more than the branch has left
            const cap = stockCap(product)
            if (cap !== null && qtyInCart(state.items, product.id) >= cap) {
                toast.error(
                    cap <= 0
                        ? `${product.name} is sold out.`
                        : `Only ${cap} of ${product.name} left — that's all of them.`,
                    { id: `cap-${product.id}` }
                )
                return state
            }

            // Unique key = product.id + variant so same product in different sizes stacks separately
            const existing = state.items.find((i) => i.product.id === product.id && (i.variant ?? '') === (variant ?? ''))
            if (existing) {
                return { items: state.items.map((i) => (i.product.id === product.id && (i.variant ?? '') === (variant ?? ''))
                    ? { ...i, quantity: i.quantity + 1 }
                    : i
                )}
            }
            return { items: [...state.items, { product, quantity: 1, notes: '', variant, overridePrice }] }
        }),

    removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.product.id !== productId) })),

    updateQty: (productId, qty) =>
        set((state) => {
            if (qty < 1) return state // Never delete via qty — use cancelItem instead

            const line = state.items.find(i => i.product.id === productId)
            if (line) {
                const cap = stockCap(line.product)
                if (cap !== null) {
                    // Whatever is on this product's other lines already eats into the count
                    const allowance = cap - qtyInCart(state.items, productId, cartItemKey(line))
                    if (qty > allowance) {
                        toast.error(
                            allowance <= 0
                                ? `${line.product.name} is sold out.`
                                : `Only ${cap} of ${line.product.name} left.`,
                            { id: `cap-${productId}` }
                        )
                        qty = Math.max(1, allowance)
                    }
                }
            }
            return { items: state.items.map((i) => i.product.id === productId ? { ...i, quantity: qty } : i) }
        }),

    updateNotes: (productId, notes) =>
        set((state) => ({
            items: state.items.map((i) => i.product.id === productId ? { ...i, notes } : i),
        })),

    cancelItem: (productId) =>
        set((state) => ({
            items: state.items.map((i) =>
                i.product.id === productId ? { ...i, cancelled: !i.cancelled } : i
            ),
        })),

    setDiscount: (type, customAmount = 0, units = null) =>
        set({ discountType: type, customDiscountAmount: customAmount, discountUnits: units }),

    setPaymentMethod: (method) => set({ paymentMethod: method, referenceNumber: '', bankName: '' }),

    setCashTendered: (amount) => set({ cashTendered: amount }),

    setReferenceNumber: (ref) => set({ referenceNumber: ref }),

    setBankName: (bank) => set({ bankName: bank }),

    setResumedHold: (id, ref, tableNumber = null) => set({ resumedHoldId: id, resumedHoldRef: ref, resumedTableNumber: tableNumber }),

    setDeliveryPlatform: (platform) => set({ deliveryPlatform: platform }),

    reset: () => set({ ...initialState }),

    clearCart: () => set({ items: [], resumedHoldId: null, resumedHoldRef: null, resumedTableNumber: null }),
}))
