import Dexie, { type Table } from 'dexie'

// ─── Split Payment Entry ───────────────────────────────────────────────────
export interface SplitPaymentEntry {
    method: string
    amount: number
    referenceNumber?: string
    bankName?: string
}

// ─── Completed Transaction (Checkout Outbox) ───────────────────────────────
export interface LocalTransaction {
    localRef: string          // UUID generated on device — primary key
    branchId: string
    cashierId: string | null
    totalAmount: number
    discountType: string
    discountAmount: number
    paymentMethod: string
    referenceNumber?: string  // Last 6 digits for GCash/Maya, 5 for Bank Transfer
    bankName?: string         // For bank_transfer: BDO, BPI, Metrobank, etc.
    splitPayments?: SplitPaymentEntry[]  // Populated for split payment transactions
    status: string
    source: string
    tableNumber?: string      // Table number if order came from a held order
    voidReason?: string       // Populated when status = 'voided'
    voidedBy?: string         // Manager user ID who authorised the void
    items: LocalTransactionItem[]
    syncStatus: 'pending' | 'synced' | 'failed'
    createdAt: string
    supabaseId?: string       // filled after successful sync
}

export interface LocalTransactionItem {
    productId: string
    productName: string
    quantity: number
    unitPrice: number
    subtotal: number
}

// ─── Offline Held Order ────────────────────────────────────────────────────
export interface LocalHeldOrder {
    localId: string           // UUID — primary key
    branchId: string
    cashierId: string | null
    tableRef: string | null   // table number / label entered by cashier
    totalAmount: number
    items: LocalTransactionItem[]
    syncStatus: 'local' | 'synced' | 'failed'
    createdAt: string
    supabaseId?: string       // Supabase transactions.id after sync
}

// ─── Offline Audit Log ─────────────────────────────────────────────────────
export interface LocalAuditLog {
    localId: string           // UUID — primary key
    actionType: string        // e.g. 'discount', 'void'
    performedBy: string | null
    branchId: string | null
    referenceTable: string
    notes: string
    metadata: Record<string, unknown>
    syncStatus: 'pending' | 'synced' | 'failed'
    createdAt: string
}

// ─── User Cache (Offline Login) ────────────────────────────────────────────
export interface CachedUser {
    id: string
    name: string
    role: string
    branch_id: string
    pin_code: string
    qr_access_token: string | null
    is_active: boolean
    cachedAt: string
}

// ─── Menu Cache ────────────────────────────────────────────────────────────
export interface CachedProduct {
    id: string
    name: string
    category: string
    price: number
    image_url: string | null
    is_available: boolean
    stock_qty: number | null   // null = unlimited
    cachedAt: string
}

// ─── Branch Cache ──────────────────────────────────────────────────────────
export interface CachedBranch {
    id: string
    name: string
    location: string
    status: string
}

// ─── Database ─────────────────────────────────────────────────────────────
export class WildshakesDB extends Dexie {
    transactions!: Table<LocalTransaction>
    localHeldOrders!: Table<LocalHeldOrder>
    localAuditLogs!: Table<LocalAuditLog>
    products!: Table<CachedProduct>
    branches!: Table<CachedBranch>
    users!: Table<CachedUser>

    constructor() {
        super('WildshakesNexus')

        // Version 1 — original schema (DO NOT MODIFY — required for migration)
        this.version(1).stores({
            transactions: 'localRef, syncStatus, branchId, createdAt',
            products: 'id, category, name',
            branches: 'id',
        })

        // Version 2 — adds offline held orders and audit log outboxes
        this.version(2).stores({
            transactions: 'localRef, syncStatus, branchId, createdAt',
            localHeldOrders: 'localId, syncStatus, branchId, createdAt',
            localAuditLogs: 'localId, syncStatus, createdAt',
            products: 'id, category, name',
            branches: 'id',
        })

        // Version 3 — referenceNumber / tableNumber / voidReason / voidedBy
        // stored as plain object properties; no new indexes required.
        this.version(3).stores({
            transactions: 'localRef, syncStatus, branchId, createdAt',
            localHeldOrders: 'localId, syncStatus, branchId, createdAt',
            localAuditLogs: 'localId, syncStatus, createdAt',
            products: 'id, category, name',
            branches: 'id',
        })

        // Version 4 — offline users cache
        this.version(4).stores({
            transactions: 'localRef, syncStatus, branchId, createdAt',
            localHeldOrders: 'localId, syncStatus, branchId, createdAt',
            localAuditLogs: 'localId, syncStatus, createdAt',
            products: 'id, category, name',
            branches: 'id',
            users: 'id, branch_id, pin_code, role',
        })

        // Version 5 — adds qr_access_token index for offline QR login
        this.version(5).stores({
            transactions: 'localRef, syncStatus, branchId, createdAt',
            localHeldOrders: 'localId, syncStatus, branchId, createdAt',
            localAuditLogs: 'localId, syncStatus, createdAt',
            products: 'id, category, name',
            branches: 'id',
            users: 'id, branch_id, pin_code, qr_access_token, role',
        })

        // Version 6 — splitPayments on transactions; stock_qty on products (no new indexes needed)
        this.version(6).stores({
            transactions: 'localRef, syncStatus, branchId, createdAt',
            localHeldOrders: 'localId, syncStatus, branchId, createdAt',
            localAuditLogs: 'localId, syncStatus, createdAt',
            products: 'id, category, name',
            branches: 'id',
            users: 'id, branch_id, pin_code, qr_access_token, role',
        })
    }
}

export const db = new WildshakesDB()
