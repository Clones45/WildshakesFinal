import { create } from 'zustand'
import type { Product } from '../lib/supabase'

export interface CartItem {
    product: Product
    quantity: number
    notes?: string      // e.g. "no sugar", "extra ice"
    cancelled?: boolean // Struck-through — saved for records but excluded from total/print
}

export type DiscountType = 'none' | 'senior' | 'pwd' | 'manager' | 'custom'
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
    addItem: (product: Product) => void
    removeItem: (productId: string) => void
    updateQty: (productId: string, qty: number) => void
    updateNotes: (productId: string, notes: string) => void
    cancelItem: (productId: string) => void   // Toggle strikethrough on item
    setDiscount: (type: DiscountType, customAmount?: number) => void
    setPaymentMethod: (method: PaymentMethod) => void
    setCashTendered: (amount: number) => void
    setReferenceNumber: (ref: string) => void
    setBankName: (bank: string) => void
    setResumedHold: (id: string | null, ref: string | null, tableNumber?: string | null) => void
    reset: () => void
    clearCart: () => void  // Clear items only (keep discount/payment settings)
}

const initialState = {
    items: [] as CartItem[],
    discountType: 'none' as DiscountType,
    customDiscountAmount: 0,
    paymentMethod: 'cash' as PaymentMethod,
    cashTendered: 0,
    referenceNumber: '',
    bankName: '',
    resumedHoldId: null as string | null,
    resumedHoldRef: null as string | null,
    resumedTableNumber: null as string | null,
}

export const useCartStore = create<CartState>()((set, get) => ({
    ...initialState,

    subtotal: () => get().items.filter(i => !i.cancelled).reduce((sum, i) => sum + i.product.price * i.quantity, 0),

    discountAmount: () => {
        const { discountType, customDiscountAmount } = get()
        const subtotal = get().subtotal()
        if (discountType === 'custom') return customDiscountAmount
        return subtotal * DISCOUNT_RATES[discountType]
    },

    total: () => Math.max(0, get().subtotal() - get().discountAmount()),

    change: () => Math.max(0, get().cashTendered - get().total()),

    addItem: (product) =>
        set((state) => {
            const existing = state.items.find((i) => i.product.id === product.id)
            if (existing) {
                return { items: state.items.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i) }
            }
            return { items: [...state.items, { product, quantity: 1, notes: '' }] }
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

    setDiscount: (type, customAmount = 0) =>
        set({ discountType: type, customDiscountAmount: customAmount }),

    setPaymentMethod: (method) => set({ paymentMethod: method, referenceNumber: '', bankName: '' }),

    setCashTendered: (amount) => set({ cashTendered: amount }),

    setReferenceNumber: (ref) => set({ referenceNumber: ref }),

    setBankName: (bank) => set({ bankName: bank }),

    setResumedHold: (id, ref, tableNumber = null) => set({ resumedHoldId: id, resumedHoldRef: ref, resumedTableNumber: tableNumber }),

    reset: () => set({ ...initialState }),

    clearCart: () => set({ items: [], resumedHoldId: null, resumedHoldRef: null, resumedTableNumber: null }),
}))
