import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jhicfriososaaxebktzv.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoaWNmcmlvc29zYWF4ZWJrdHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NTg4NDUsImV4cCI6MjA4ODIzNDg0NX0.Q6Oj1ofcAriSHmsnQfAzmh-e0qBIakWOaBvEj9y_m-0'

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
