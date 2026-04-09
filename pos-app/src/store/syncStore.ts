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
            const pendingTx = await db.transactions.where('syncStatus').equals('pending').toArray()
            for (const local of pendingTx) {
                try {
                    await pushTransaction(local)
                    await db.transactions.update(local.localRef, { syncStatus: 'synced' })
                } catch {
                    await db.transactions.update(local.localRef, { syncStatus: 'failed' })
                }
            }

            // ── 2. Sync locally held orders ─────────────────────────────────
            // Dynamically import to avoid a circular dependency
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
    const { data: txData, error: txError } = await supabase
        .from('transactions')
        .upsert(
            {
                branch_id: local.branchId,
                cashier_id: local.cashierId,
                total_amount: local.totalAmount,
                discount_type: local.discountType,
                discount_amount: local.discountAmount,
                payment_method: local.paymentMethod,
                status: local.status,
                source: local.source,
                local_ref: local.localRef,
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
    }))

    const { error: itemsError } = await supabase.from('transaction_items').insert(items)
    if (itemsError) throw itemsError

    await db.transactions.update(local.localRef, { supabaseId: transactionId })
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
