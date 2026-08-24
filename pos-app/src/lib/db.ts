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
    cashTendered?: number     // Cash handed over by the customer (cash or split-cash)
    changeGiven?: number      // cashTendered - totalAmount
    orderType?: 'dine-in' | 'take-out' | 'pickup'   // Set at checkout
    status: string
    source: string
    tableNumber?: string      // Table number if order came from a held order
    deliveryPlatform?: 'foodpanda' | 'grab'  // Set for FoodPanda / Grab delivery orders
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
    notes?: string
    cancelled?: boolean   // Marked wrong by cashier — saved for audit, excluded from receipt/total
    // How many units of this line the Senior/PWD/Manager discount covered.
    // Kept per item so the receipt can show exactly what was discounted (BIR
    // requires Senior/PWD discounts to be traceable on the receipt).
    discountedUnits?: number
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
    deliveryPlatform?: 'foodpanda' | 'grab' // Set for FoodPanda / Grab delivery orders
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
    stock_qty: number | null        // null = unlimited
    effective_stock: number | null  // stock_qty further narrowed by a shared ingredient
    cachedAt: string
}

// ─── Branch Cache ──────────────────────────────────────────────────────────
export interface CachedBranch {
    id: string
    name: string
    location: string
    status: string
}

// ─── Recipe Link Cache (mirrors food_item_menu_links) ──────────────────────
export interface CachedRecipeLink {
    id: string                // food_item_menu_links.id
    productId: string
    inventoryItemId: string
    quantityPerServing: number
}

// ─── Ingredient Stock Cache — today's remaining qty per ingredient, purely ──
// advisory/local; always overwritten wholesale by the next successful pull.
export interface CachedIngredientStock {
    inventoryItemId: string   // primary key
    name: string
    unit: string | null
    minStockLevel: number | null
    remaining: number | null  // null = no starting stock logged yet today (don't warn)
    updatedAt: string
}

// ─── Shift / Cash Drawer Report (End Shift outbox) ─────────────────────────
export interface LocalShift {
    localRef: string          // UUID generated on device — primary key
    branchId: string
    cashierId: string | null
    cashierName: string
    cashierRole: string
    shiftNumber: number
    status: 'open' | 'closed'
    openedAt: string
    closedAt?: string
    startingCash: number
    expectedCash?: number
    actualCash?: number
    cashDifference?: number
    grossSales?: number
    discounts?: number
    refunds?: number
    netSales?: number
    cashSales?: number
    gcashSales?: number
    mayaSales?: number
    bankTransferSales?: number
    splitSales?: number
    paidIn: number
    paidOut: number
    syncStatus: 'pending' | 'synced' | 'failed'
    supabaseId?: string       // filled after successful sync
}

// ─── Database ─────────────────────────────────────────────────────────────
export class WildshakesDB extends Dexie {
    transactions!: Table<LocalTransaction>
    localHeldOrders!: Table<LocalHeldOrder>
    localAuditLogs!: Table<LocalAuditLog>
    products!: Table<CachedProduct>
    branches!: Table<CachedBranch>
    users!: Table<CachedUser>
    recipeLinks!: Table<CachedRecipeLink>
    ingredientStock!: Table<CachedIngredientStock>
    shifts!: Table<LocalShift>

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

        // Version 7 — orderType (dine-in / take-out); no new indexes needed
        this.version(7).stores({
            transactions: 'localRef, syncStatus, branchId, createdAt',
            localHeldOrders: 'localId, syncStatus, branchId, createdAt',
            localAuditLogs: 'localId, syncStatus, createdAt',
            products: 'id, category, name',
            branches: 'id',
            users: 'id, branch_id, pin_code, qr_access_token, role',
        })

        // Version 8 — deliveryPlatform ('foodpanda' | 'grab'); no new indexes needed
        this.version(8).stores({
            transactions: 'localRef, syncStatus, branchId, createdAt',
            localHeldOrders: 'localId, syncStatus, branchId, createdAt',
            localAuditLogs: 'localId, syncStatus, createdAt',
            products: 'id, category, name',
            branches: 'id',
            users: 'id, branch_id, pin_code, qr_access_token, role',
        })

        // Version 9 — Smart Inventory: local recipe links + today's ingredient stock,
        // for instant offline-capable low-stock warnings at checkout.
        this.version(9).stores({
            transactions: 'localRef, syncStatus, branchId, createdAt',
            localHeldOrders: 'localId, syncStatus, branchId, createdAt',
            localAuditLogs: 'localId, syncStatus, createdAt',
            products: 'id, category, name',
            branches: 'id',
            users: 'id, branch_id, pin_code, qr_access_token, role',
            recipeLinks: 'id, productId, inventoryItemId',
            ingredientStock: 'inventoryItemId',
        })

        // Version 10 — End Shift: local shift/cash-drawer report outbox.
        this.version(10).stores({
            transactions: 'localRef, syncStatus, branchId, createdAt',
            localHeldOrders: 'localId, syncStatus, branchId, createdAt',
            localAuditLogs: 'localId, syncStatus, createdAt',
            products: 'id, category, name',
            branches: 'id',
            users: 'id, branch_id, pin_code, qr_access_token, role',
            recipeLinks: 'id, productId, inventoryItemId',
            ingredientStock: 'inventoryItemId',
            shifts: 'localRef, syncStatus, branchId, cashierId, status',
        })
    }
}

export const db = new WildshakesDB()
