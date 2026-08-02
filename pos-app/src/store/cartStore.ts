import { create } from 'zustand'
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
    // Cart-line keys the discount applies to. Empty = whole order (also covers
    // items added later); non-empty = only those lines (Senior/PWD: the law
    // applies the 20% only to the senior's/PWD's own items, not the group's bill).
    discountItemKeys: string[]
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
    setDiscount: (type: DiscountType, customAmount?: number, itemKeys?: string[]) => void
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
    discountItemKeys: [] as string[],
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
        const { discountType, customDiscountAmount, discountItemKeys, items } = get()
        if (discountType === 'custom') return customDiscountAmount
        const rate = DISCOUNT_RATES[discountType]
        if (rate === 0) return 0
        const active = items.filter(i => !i.cancelled)
        const base = discountItemKeys.length === 0
            ? active
            : active.filter(i => discountItemKeys.includes(cartItemKey(i)))
        return base.reduce((sum, i) => sum + (i.overridePrice ?? i.product.price) * i.quantity, 0) * rate
    },

    total: () => Math.max(0, get().subtotal() - get().discountAmount()),

    change: () => Math.max(0, get().cashTendered - get().total()),

    addItem: (product, variant, overridePrice) =>
        set((state) => {
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

    setDiscount: (type, customAmount = 0, itemKeys = []) =>
        set({ discountType: type, customDiscountAmount: customAmount, discountItemKeys: itemKeys }),

    setPaymentMethod: (method) => set({ paymentMethod: method, referenceNumber: '', bankName: '' }),

    setCashTendered: (amount) => set({ cashTendered: amount }),

    setReferenceNumber: (ref) => set({ referenceNumber: ref }),

    setBankName: (bank) => set({ bankName: bank }),

    setResumedHold: (id, ref, tableNumber = null) => set({ resumedHoldId: id, resumedHoldRef: ref, resumedTableNumber: tableNumber }),

    setDeliveryPlatform: (platform) => set({ deliveryPlatform: platform }),

    reset: () => set({ ...initialState }),

    clearCart: () => set({ items: [], resumedHoldId: null, resumedHoldRef: null, resumedTableNumber: null }),
}))
