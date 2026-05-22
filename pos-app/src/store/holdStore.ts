import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { db, type LocalHeldOrder } from '../lib/db'
import type { CartItem } from './cartStore'
import { useAuthStore } from './authStore'
import { logAudit } from '../lib/auditLog'
import { toast } from 'react-hot-toast'

/**
 * Offline-First Hold Store
 *
 * Flow when ONLINE:
 *   holdOrder → insert directly into Supabase transactions (status='pending')
 *            → mark localHeldOrder as syncStatus='synced'
 *
 * Flow when OFFLINE:
 *   holdOrder → save to db.localHeldOrders (syncStatus='local')
 *            → displayed to cashier immediately from local IndexedDB
 *
 * On reconnect (triggered by syncStore):
 *   syncLocalHeldOrders → push all syncStatus='local' rows to Supabase
 *
 * Resume always reads from the merged list (Supabase + local).
 */

export interface HeldOrder {
    id: string               // Supabase UUID  OR  localId (prefixed 'local::')
    total_amount: number
    created_at: string
    local_ref: string | null
    table_number: string | null  // dedicated table number column
    isLocal: boolean             // true = only in IndexedDB, not yet synced
    items: HeldOrderItem[]
}

export interface HeldOrderItem {
    id: string
    menu_item_id: string
    item_name: string
    quantity: number
    unit_price: number
    cancelled?: boolean   // Logged for audit — excluded from totals and print
}

interface HoldState {
    heldOrders: HeldOrder[]
    isLoading: boolean

    fetchHeldOrders: () => Promise<void>
    holdOrder: (cartItems: CartItem[], tableRef?: string) => Promise<string | null>
    updateHeldOrder: (id: string, cartItems: CartItem[], tableRef?: string) => Promise<string | null>
    resumeOrder: (order: HeldOrder) => HeldOrder
    deleteHeldOrder: (id: string) => Promise<void>
    voidHeldOrder: (id: string, voidedBy: string, reason: string) => Promise<void>
    syncLocalHeldOrders: () => Promise<void>
}

// ─── Helper: map a LocalHeldOrder → HeldOrder for UI ──────────────────────
function localToHeld(local: LocalHeldOrder): HeldOrder {
    return {
        id: `local::${local.localId}`,
        total_amount: local.totalAmount,
        created_at: local.createdAt,
        local_ref: local.tableRef,
        table_number: local.tableRef,
        isLocal: true,
        items: local.items.map((i) => ({
            id: i.productId,
            menu_item_id: i.productId,
            item_name: i.productName,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            cancelled: i.cancelled ?? false,
        })),
    }
}

export const useHoldStore = create<HoldState>()((set, get) => ({
    heldOrders: [],
    isLoading: false,

    // ── Fetch: merge Supabase held + local-only held ────────────────────────
    fetchHeldOrders: async () => {
        set({ isLoading: true })
        try {
            // 1. Local-only held orders (offline holds not yet synced)
            const localHolds = await db.localHeldOrders
                .where('syncStatus').equals('local')
                .toArray()
            const localOrders: HeldOrder[] = localHolds.map(localToHeld)

            // 2. Try to fetch from Supabase (skip gracefully when offline)
            let remoteOrders: HeldOrder[] = []
            if (navigator.onLine) {
                const { data: txns, error: txnErr } = await supabase
                    .from('transactions')
                    .select('id, total_amount, created_at, local_ref, table_number')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })

                if (!txnErr && txns && txns.length > 0) {
                    const txnIds = (txns as Record<string, unknown>[]).map((t) => t.id as string)

                    const { data: allItems } = await supabase
                        .from('transaction_items')
                        .select('id, transaction_id, product_id, quantity, unit_price, cancelled')
                        .in('transaction_id', txnIds)

                    // Build product name lookup from local cache (always available)
                    const cachedProducts = await db.products.toArray()
                    const nameMap = new Map<string, string>(
                        cachedProducts.map((p) => [p.id, p.name])
                    )

                    remoteOrders = (txns as Record<string, unknown>[]).map((t) => ({
                        id: String(t.id),
                        total_amount: Number(t.total_amount),
                        created_at: String(t.created_at),
                        local_ref: (t.local_ref as string | null) ?? null,
                        table_number: (t.table_number as string | null) ?? null,
                        isLocal: false,
                        items: ((allItems ?? []) as Record<string, unknown>[])
                            .filter((i) => i.transaction_id === t.id)
                            .map((ti) => {
                                const productId = String(ti.product_id)
                                return {
                                    id: String(ti.id),
                                    menu_item_id: productId,
                                    item_name: nameMap.get(productId) ?? productId,
                                    quantity: Number(ti.quantity),
                                    unit_price: Number(ti.unit_price),
                                    cancelled: Boolean(ti.cancelled),
                                }
                            }),
                    }))
                }
            }

            // Merge: local-only first (most recent action), then remote
            set({ heldOrders: [...localOrders, ...remoteOrders] })
        } catch (err) {
            console.error('Failed to fetch held orders', err)
        } finally {
            set({ isLoading: false })
        }
    },

    // ── Hold: try Supabase, fall back to IndexedDB ──────────────────────────
    holdOrder: async (cartItems, tableRef) => {
        if (cartItems.length === 0) return null

        const { branch, user } = useAuthStore.getState()
        if (!branch?.id) {
            toast.error('No branch selected — please log in again')
            return null
        }

        // Save ALL items (including cancelled) for audit — total excludes cancelled
        const activeItems = cartItems.filter((i) => !i.cancelled)
        const total = activeItems.reduce((s, i) => s + i.product.price * i.quantity, 0)
        const localId = uuidv4()
        const ref = tableRef ?? null

        // Guard: duplicate table ref in held orders
        const duplicate = get().heldOrders.find(
            (o) => (o.table_number === ref || o.local_ref === ref) && ref !== null
        )
        if (duplicate) {
            toast.error('Table already has an active held order. Resume it to add items or check out.', { duration: 4000 })
            return null
        }

        // ALL items saved — cancelled flag preserved for admin audit trail
        const localItems = cartItems.map((i) => ({
            productId: i.product.id,
            productName: i.variant ? `${i.product.name} · ${i.variant}` : i.product.name,
            quantity: i.quantity,
            unitPrice: i.product.price,
            subtotal: i.product.price * i.quantity,
            cancelled: i.cancelled ?? false,
        }))

        // ── Offline path ──────────────────────────────────────────────────────
        if (!navigator.onLine) {
            const localHeld: LocalHeldOrder = {
                localId,
                branchId: branch.id,
                cashierId: user?.id ?? null,
                tableRef: ref,
                totalAmount: total,
                items: localItems,
                syncStatus: 'local',
                createdAt: new Date().toISOString(),
            }
            await db.localHeldOrders.add(localHeld)
            toast.success('Order held locally (offline) ✓', { icon: '📦' })
            await get().fetchHeldOrders()
            return `local::${localId}`
        }

        // ── Online path ───────────────────────────────────────────────────────
        try {
            const payload = {
                branch_id: branch.id,
                cashier_id: user?.id ?? null,
                status: 'pending',
                total_amount: total,
                discount_type: 'none',
                discount_amount: 0,
                payment_method: 'cash',
                source: 'pos',
                local_ref: ref ?? `hold-${localId}`,
                table_number: ref ?? null,
            }

            let { data: txn, error: txnErr } = await supabase
                .from('transactions')
                .insert(payload)
                .select('id')
                .single()

            if (txnErr?.code === '23505') {
                ;({ data: txn, error: txnErr } = await supabase
                    .from('transactions')
                    .insert({ ...payload, local_ref: `hold-${localId}` })
                    .select('id')
                    .single())
            }

            if (txnErr || !txn) throw txnErr ?? new Error('No transaction returned')

            const lineItems = localItems.map((i) => ({
                transaction_id: txn.id,
                product_id: i.productId,
                quantity: i.quantity,
                unit_price: i.unitPrice,
                subtotal: i.subtotal,
                cancelled: i.cancelled ?? false,
            }))
            const { error: itemsErr } = await supabase.from('transaction_items').insert(lineItems)
            if (itemsErr) throw itemsErr

            toast.success('Order held ✓', { icon: '⏸️' })
            await get().fetchHeldOrders()
            return String(txn.id)
        } catch (err) {
            // Supabase failed mid-attempt → save locally so no order is ever lost
            console.error('Hold online failed, saving locally', err)
            const localHeld: LocalHeldOrder = {
                localId,
                branchId: branch.id,
                cashierId: user?.id ?? null,
                tableRef: ref,
                totalAmount: total,
                items: localItems,
                syncStatus: 'local',
                createdAt: new Date().toISOString(),
            }
            await db.localHeldOrders.add(localHeld)
            toast.success('Connection issue — order held locally ✓', { icon: '📦' })
            await get().fetchHeldOrders()
            return `local::${localId}`
        }
    },

    // ── Update held (always online; local-held are replaced by a fresh hold) ─
    updateHeldOrder: async (id, cartItems, tableRef) => {
        const total = cartItems.filter((i) => !i.cancelled).reduce((s, i) => s + i.product.price * i.quantity, 0)
        const { user } = useAuthStore.getState()

        // Local-only hold: save ALL items with cancelled flag for audit
        if (id.startsWith('local::')) {
            const localId = id.replace('local::', '')
            const localItems = cartItems.map((i) => ({
                productId: i.product.id,
                productName: i.variant ? `${i.product.name} · ${i.variant}` : i.product.name,
                quantity: i.quantity,
                unitPrice: i.product.price,
                subtotal: i.product.price * i.quantity,
                cancelled: i.cancelled ?? false,
            }))
            await db.localHeldOrders.update(localId, {
                totalAmount: total,
                items: localItems,
                ...(tableRef !== undefined ? { tableRef } : {}),
            })
            toast.success('Order updated locally ✓', { icon: '✏️' })
            await get().fetchHeldOrders()
            return id
        }

        // Remote hold: update via Supabase
        try {
            const { error: txnErr } = await supabase
                .from('transactions')
                .update({
                    total_amount: total,
                    cashier_id: user?.id ?? null,
                    ...(tableRef !== undefined ? { local_ref: tableRef, table_number: tableRef } : {}),
                })
                .eq('id', id)
            if (txnErr) throw txnErr

            // Remote hold: replace items — save ALL (with cancelled flag)
            await supabase.from('transaction_items').delete().eq('transaction_id', id)
            const lineItems = cartItems.map((i) => ({
                transaction_id: id,
                product_id: i.product.id,
                quantity: i.quantity,
                unit_price: i.product.price,
                subtotal: i.product.price * i.quantity,
                cancelled: i.cancelled ?? false,
            }))
            const { error: itemsErr } = await supabase.from('transaction_items').insert(lineItems)
            if (itemsErr) throw itemsErr

            toast.success('Order updated ✓', { icon: '✏️' })
            await get().fetchHeldOrders()
            return id
        } catch (err) {
            console.error('Update held order failed', err)
            toast.error('Failed to update held order')
            return null
        }
    },

    resumeOrder: (order) => order,

    // ── Delete: local or remote ─────────────────────────────────────────────
    deleteHeldOrder: async (id) => {
        if (id.startsWith('local::')) {
            const localId = id.replace('local::', '')
            await db.localHeldOrders.delete(localId)
            set((s) => ({ heldOrders: s.heldOrders.filter((o) => o.id !== id) }))
            return
        }
        try {
            await supabase.from('transaction_items').delete().eq('transaction_id', id)
            const { error } = await supabase.from('transactions').delete().eq('id', id)
            if (error) throw error
            set((s) => ({ heldOrders: s.heldOrders.filter((o) => o.id !== id) }))
        } catch (err) {
            console.error('Delete held order failed', err)
            toast.error('Failed to remove held order')
        }
    },

    // ── Void: marks the held order as voided + audit log ───────────────────
    voidHeldOrder: async (id, voidedBy, reason) => {
        const { branch } = useAuthStore.getState()

        if (id.startsWith('local::')) {
            // Local-only hold — just remove from IndexedDB, can't un-create it in Supabase
            const localId = id.replace('local::', '')
            await db.localHeldOrders.delete(localId)

            logAudit({
                actionType: 'void',
                performedBy: voidedBy,
                branchId: branch?.id,
                referenceTable: 'transactions',
                notes: `Local held order ${localId} voided. Reason: ${reason}`,
                metadata: { local_id: localId, void_reason: reason, authorized_by: voidedBy },
            }).catch(console.error)

            set((s) => ({ heldOrders: s.heldOrders.filter((o) => o.id !== id) }))
            toast.success('Order voided ✓', { icon: '🚫' })
            return
        }

        // Remote hold — update status in Supabase
        try {
            const { error } = await supabase
                .from('transactions')
                .update({
                    status: 'voided',
                    void_reason: reason,
                    voided_by: voidedBy,
                })
                .eq('id', id)
            if (error) throw error

            logAudit({
                actionType: 'void',
                performedBy: voidedBy,
                branchId: branch?.id,
                referenceTable: 'transactions',
                notes: `Transaction ${id} voided. Reason: ${reason}`,
                metadata: { transaction_id: id, void_reason: reason, authorized_by: voidedBy },
            }).catch(console.error)

            set((s) => ({ heldOrders: s.heldOrders.filter((o) => o.id !== id) }))
            toast.success('Order voided ✓', { icon: '🚫' })
        } catch (err) {
            console.error('Void held order failed', err)
            toast.error('Failed to void order')
        }
    },

    // ── Sync local-only holds to Supabase (called on reconnect) ────────────
    syncLocalHeldOrders: async () => {
        const pending = await db.localHeldOrders.where('syncStatus').equals('local').toArray()
        if (pending.length === 0) return

        console.log(`[holdStore] Syncing ${pending.length} locally held order(s)…`)
        for (const local of pending) {
            try {
                const payload = {
                    branch_id: local.branchId,
                    cashier_id: local.cashierId,
                    status: 'pending',
                    total_amount: local.totalAmount,
                    discount_type: 'none',
                    discount_amount: 0,
                    payment_method: 'cash',
                    source: 'pos',
                    local_ref: local.tableRef ?? `hold-${local.localId}`,
                    table_number: local.tableRef ?? null,
                }

                const { data: txn, error: txnErr } = await supabase
                    .from('transactions')
                    .insert(payload)
                    .select('id')
                    .single()
                if (txnErr || !txn) throw txnErr

                const lineItems = local.items.map((i) => ({
                    transaction_id: txn.id,
                    product_id: i.productId,
                    quantity: i.quantity,
                    unit_price: i.unitPrice,
                    subtotal: i.subtotal,
                    cancelled: i.cancelled ?? false,
                }))
                const { error: itemsErr } = await supabase.from('transaction_items').insert(lineItems)
                if (itemsErr) throw itemsErr

                await db.localHeldOrders.update(local.localId, {
                    syncStatus: 'synced',
                    supabaseId: txn.id,
                })
                console.log(`[holdStore] Synced local hold ${local.localId} → Supabase ${txn.id}`)
            } catch (err) {
                await db.localHeldOrders.update(local.localId, { syncStatus: 'failed' })
                console.error(`[holdStore] Failed to sync hold ${local.localId}`, err)
            }
        }

        await get().fetchHeldOrders()
    },
}))
