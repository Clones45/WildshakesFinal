import { create } from 'zustand'
import { db, type LocalTransaction, type LocalAuditLog } from '../lib/db'
import { supabase } from '../lib/supabase'

interface SyncState {
    isOnline: boolean
    isSyncing: boolean
    pendingCount: number
    lastSyncAt: string | null
    setOnline: (online: boolean) => void
    refreshPendingCount: () => Promise<void>
    syncPending: () => Promise<void>
}

export const useSyncStore = create<SyncState>()((set, get) => ({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    lastSyncAt: null,

    setOnline: (online) => {
        set({ isOnline: online })
        if (online) get().syncPending()
    },

    refreshPendingCount: async () => {
        const txCount = await db.transactions.where('syncStatus').equals('pending').count()
        const holdCount = await db.localHeldOrders.where('syncStatus').equals('local').count()
        const auditCount = await db.localAuditLogs.where('syncStatus').equals('pending').count()
        set({ pendingCount: txCount + holdCount + auditCount })
    },

    syncPending: async () => {
        const { isSyncing } = get()
        if (isSyncing || !navigator.onLine) return
        set({ isSyncing: true })

        try {
            // ── 1. Sync completed transactions ──────────────────────────────
            const pendingTx = await db.transactions.where('syncStatus').anyOf(['pending', 'failed']).toArray()
            for (const local of pendingTx) {
                try {
                    await pushTransaction(local)
                    await db.transactions.update(local.localRef, { syncStatus: 'synced' })
                } catch {
                    await db.transactions.update(local.localRef, { syncStatus: 'failed' })
                }
            }

            // ── 2. Sync locally held orders ─────────────────────────────────
            const { useHoldStore } = await import('./holdStore')
            await useHoldStore.getState().syncLocalHeldOrders()

            // ── 3. Sync audit logs ──────────────────────────────────────────
            const pendingAudit = await db.localAuditLogs.where('syncStatus').equals('pending').toArray()
            for (const log of pendingAudit) {
                try {
                    await pushAuditLog(log)
                    await db.localAuditLogs.update(log.localId, { syncStatus: 'synced' })
                } catch {
                    await db.localAuditLogs.update(log.localId, { syncStatus: 'failed' })
                }
            }

            // ── 4. Pull latest users for offline login ──────────────────────
            const { useAuthStore } = await import('./authStore')
            const currentBranch = useAuthStore.getState().branch
            if (currentBranch) {
                const { data: users } = await supabase
                    .from('users')
                    .select('id, name, role, branch_id, pin_code, qr_access_token, is_active')
                    .eq('branch_id', currentBranch.id)
                    .eq('is_active', true)
                
                if (users) {
                    await db.users.clear()
                    await db.users.bulkPut(
                        users.map(u => ({ ...u, cachedAt: new Date().toISOString() }))
                    )
                }

                // ── 5. Pull recipe links + today's ingredient remaining stock ────
                // Smart Inventory: purely advisory/local, wholly overwritten every pull —
                // powers the instant, fully-offline low-stock warning at checkout.
                await pullIngredientStock(currentBranch.id)
            }

            const stillPending =
                (await db.transactions.where('syncStatus').equals('pending').count()) +
                (await db.localHeldOrders.where('syncStatus').equals('local').count()) +
                (await db.localAuditLogs.where('syncStatus').equals('pending').count())

            set({ isSyncing: false, pendingCount: stillPending, lastSyncAt: new Date().toISOString() })
            if (pendingTx.length > 0 || pendingAudit.length > 0) {
                console.log('[syncStore] Background sync complete')
            }
        } catch {
            set({ isSyncing: false })
        }
    },
}))

// ── Push a completed checkout transaction ────────────────────────────────────
async function pushTransaction(local: LocalTransaction) {
    // ── Path A: transaction already in Supabase (e.g. being voided) ─────────
    // Just UPDATE the status fields — never re-insert items that already exist
    if (local.supabaseId) {
        const { error } = await supabase
            .from('transactions')
            .update({
                status: local.status,
                void_reason: local.voidReason ?? null,
                voided_by: local.voidedBy ?? null,
            })
            .eq('id', local.supabaseId)
        if (error) throw error
        return
    }

    // ── Path B: brand-new transaction — upsert + insert items ───────────────
    const { data: txData, error: txError } = await supabase
        .from('transactions')
        .upsert(
            {
                branch_id: local.branchId,
                cashier_id: local.cashierId,
                total_amount: local.totalAmount,
                discount_type: local.discountType,
                discount_amount: local.discountAmount,
                payment_method: ['foodpanda', 'grab'].includes(local.paymentMethod) ? 'other' : local.paymentMethod,
                reference_number: local.referenceNumber ?? null,
                bank_name: local.bankName ?? null,
                status: local.status,
                source: local.source,
                local_ref: local.localRef,
                table_number: local.tableNumber ?? null,
                delivery_platform: local.deliveryPlatform ?? null,
                void_reason: local.voidReason ?? null,
                voided_by: local.voidedBy ?? null,
                created_at: local.createdAt,
            },
            { onConflict: 'local_ref', ignoreDuplicates: false }
        )
        .select('id')
        .single()

    if (txError) throw txError
    const transactionId = txData.id

    const items = local.items.map((item) => ({
        transaction_id: transactionId,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.subtotal,
        notes: item.notes ?? null,
        cancelled: item.cancelled ?? false,
    }))

    const { error: itemsError } = await supabase.from('transaction_items').insert(items)
    if (itemsError) throw itemsError

    await db.transactions.update(local.localRef, { supabaseId: transactionId })
}

// ── Pull recipe links + today's per-ingredient remaining stock ──────────────
async function pullIngredientStock(branchId: string) {
    const { data: links } = await supabase
        .from('food_item_menu_links')
        .select('id, product_id, inventory_item_id, quantity_per_serving')
    if (links) {
        await db.recipeLinks.clear()
        await db.recipeLinks.bulkPut(
            links
                .filter(l => l.quantity_per_serving != null)
                .map(l => ({
                    id: l.id,
                    productId: l.product_id,
                    inventoryItemId: l.inventory_item_id,
                    quantityPerServing: l.quantity_per_serving as number,
                }))
        )
    }

    const { data: items } = await supabase
        .from('inventory_items')
        .select('id, name, unit, min_stock_level')
        .eq('is_active', true)
    if (!items) return

    // Branch-local (Asia/Manila) day — must match the server trigger's log_date so today's
    // used_stock lines up with today's starting/additional stock.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
    const { data: logs } = await supabase
        .from('daily_inventory_logs')
        .select('inventory_item_id, starting_stock, additional_stock, used_stock')
        .eq('branch_id', branchId)
        .eq('log_date', today)
    const logByItem = new Map((logs ?? []).map(l => [l.inventory_item_id, l]))

    await db.ingredientStock.clear()
    await db.ingredientStock.bulkPut(
        items.map(it => {
            const log = logByItem.get(it.id)
            const start = log?.starting_stock ?? null
            const remaining = start === null
                ? null // no morning count logged yet today — treat as unknown, never warn
                : start + (log?.additional_stock ?? 0) - (log?.used_stock ?? 0)
            return {
                inventoryItemId: it.id,
                name: it.name,
                unit: it.unit,
                minStockLevel: it.min_stock_level,
                remaining,
                updatedAt: new Date().toISOString(),
            }
        })
    )
}

// ── Push a queued audit log entry ────────────────────────────────────────────
async function pushAuditLog(log: LocalAuditLog) {
    const { error } = await supabase.from('audit_logs').insert({
        action_type: log.actionType,
        performed_by: log.performedBy,
        branch_id: log.branchId,
        reference_table: log.referenceTable,
        notes: log.notes,
        metadata: log.metadata,
        created_at: log.createdAt,
    })
    if (error) throw error
}
