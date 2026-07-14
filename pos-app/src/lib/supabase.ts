import { createClient } from '@supabase/supabase-js'

// Clear any stale Supabase Auth session if the device is already claimed.
// This prevents Supabase client from sending expired JWTs and causing query failures.
if (typeof window !== 'undefined') {
    const isClaimed = localStorage.getItem('ws_device_branch')
    if (isClaimed) {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                console.warn('[Supabase] Removing stale auth token for claimed device:', key)
                localStorage.removeItem(key)
            }
        }
    }
}

// The anon key is safe to ship inside the built APK (Supabase's security model
// relies on RLS policies, not on keeping this key secret) — this still moves it
// out of source so it's not hardcoded, and so a different Supabase project can
// be targeted (staging, another franchise deployment) without a code change.
// See .env.example for the required keys.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
        'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy pos-app/.env.example to pos-app/.env and fill in your Supabase project values.'
    )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } },
})

// ─── Types matching our Supabase schema ─────────────────────────────────────

export type Branch = {
    id: string
    name: string
    location: string
    status: 'active' | 'inactive'
    owner_name: string | null
    owner_email: string | null
    auth_id: string | null          // Supabase Auth UUID of the franchisee owner
    region: string | null
    active_device_id: string | null // Device lock — UUID of the claiming tablet
    franchise_id: string | null
    created_at: string
}

export type UserProfile = {
    id: string
    auth_id: string | null
    name: string
    email: string | null
    role: 'cashier' | 'manager' | 'investor'
    branch_id: string | null
    pin_code: string | null
    qr_access_token: string | null
    is_active: boolean
    created_at: string
}

export type Product = {
    id: string
    name: string
    category: string
    price: number
    image_url: string | null
    is_available: boolean
}

export type Ingredient = {
    id: string
    name: string
    unit_of_measure: string
    cost_per_unit: number
}

export type RecipeMapping = {
    id: string
    product_id: string
    ingredient_id: string
    quantity_needed: number
}

export type InventoryRow = {
    id: string
    branch_id: string
    ingredient_id: string
    current_stock: number
    safety_level: number
    last_updated: string
}

export type Transaction = {
    id: string
    branch_id: string
    cashier_id: string | null
    total_amount: number
    discount_type: 'none' | 'senior' | 'pwd' | 'manager' | 'custom'
    discount_amount: number
    payment_method: 'cash' | 'gcash' | 'card' | 'other'
    status: 'completed' | 'voided' | 'pending'
    source: 'pos' | 'online'
    local_ref: string | null
    created_at: string
}

export type TransactionItem = {
    id: string
    transaction_id: string
    product_id: string
    quantity: number
    unit_price: number
    subtotal: number
}

export type Shift = {
    id: string
    branch_id: string
    cashier_id: string | null
    cashier_name: string
    cashier_role: string
    shift_number: number
    local_ref: string
    status: 'open' | 'closed'
    opened_at: string
    closed_at: string | null
    starting_cash: number
    expected_cash: number | null
    actual_cash: number | null
    cash_difference: number | null
    gross_sales: number | null
    discounts: number | null
    refunds: number | null
    net_sales: number | null
    cash_sales: number | null
    gcash_sales: number | null
    maya_sales: number | null
    bank_transfer_sales: number | null
    split_sales: number | null
    paid_in: number
    paid_out: number
    created_at: string
}

export type AuditLog = {
    id: string
    action_type: 'void' | 'discount' | 'inventory_adjustment' | 'price_change' | 'user_change'
    performed_by: string | null
    branch_id: string | null
    reference_id: string | null
    reference_table: string | null
    notes: string | null
    metadata: Record<string, unknown> | null
    created_at: string
}
