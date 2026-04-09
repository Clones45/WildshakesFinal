import Dexie, { type Table } from 'dexie'

// ─── Completed Transaction (Checkout Outbox) ───────────────────────────────
export interface LocalTransaction {
    localRef: string          // UUID generated on device — primary key
    branchId: string
    cashierId: string | null
    totalAmount: number
    discountType: string
    discountAmount: number
    paymentMethod: string
    status: string
    source: string
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

// ─── Menu Cache ────────────────────────────────────────────────────────────
export interface CachedProduct {
    id: string
    name: string
    category: string
    price: number
    image_url: string | null
    is_available: boolean
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
    }
}

export const db = new WildshakesDB()
