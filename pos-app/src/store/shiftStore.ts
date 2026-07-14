import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { db, type LocalShift, type LocalTransaction } from '../lib/db'
import { supabase } from '../lib/supabase'
import type { UserProfile, Branch } from '../lib/supabase'

export interface ShiftSummary extends LocalShift {
    otherSales: number    // delivery ('other') sales — receipt-only, not synced
    cashPayments: number  // gross cash taken in this shift, before voids — receipt-only
    cashRefunds: number   // cash given back on voided sales this shift — receipt-only
}

interface ShiftState {
    currentShift: LocalShift | null
    isEnding: boolean
    ensureShiftOpen: (user: UserProfile, branch: Branch) => Promise<void>
    previewSummary: (actualCash: number) => Promise<ShiftSummary | null>
    endShift: (actualCash: number) => Promise<ShiftSummary | null>
    syncPendingShifts: () => Promise<void>
}

// ── Bucket a set of transactions' payment amounts by method, decomposing ────
// split payments into their component methods so cash/gcash/etc always
// reflect what actually moved, whether tendered as one method or several.
function bucketByMethod(transactions: LocalTransaction[]): Record<string, number> {
    const buckets: Record<string, number> = { cash: 0, gcash: 0, maya: 0, bank_transfer: 0, other: 0 }
    for (const tx of transactions) {
        if (tx.paymentMethod === 'split' && tx.splitPayments) {
            for (const s of tx.splitPayments) {
                buckets[s.method] = (buckets[s.method] ?? 0) + s.amount
            }
        } else {
            buckets[tx.paymentMethod] = (buckets[tx.paymentMethod] ?? 0) + tx.totalAmount
        }
    }
    return buckets
}

// Pure computation shared by the live preview (modal, before confirming) and
// the final close (which persists the result) — kept in one place so the
// numbers a cashier sees are guaranteed to match what gets printed.
async function computeSummary(shift: LocalShift, actualCash: number, closedAt: string): Promise<ShiftSummary> {
    const shiftTx = await db.transactions
        .where('branchId').equals(shift.branchId)
        .filter(tx =>
            tx.status !== 'pending' &&
            tx.createdAt >= shift.openedAt &&
            tx.createdAt <= closedAt
        )
        .toArray()

    const completed = shiftTx.filter(tx => tx.status === 'completed')
    const voided = shiftTx.filter(tx => tx.status === 'voided')

    const subtotalOf = (tx: LocalTransaction) => tx.totalAmount + tx.discountAmount
    const grossSales = [...completed, ...voided].reduce((s, tx) => s + subtotalOf(tx), 0)
    const discounts = [...completed, ...voided].reduce((s, tx) => s + tx.discountAmount, 0)
    const refunds = voided.reduce((s, tx) => s + tx.totalAmount, 0)
    const netSales = grossSales - discounts - refunds

    const completedBuckets = bucketByMethod(completed)
    const voidedBuckets = bucketByMethod(voided)

    const cashPayments = completedBuckets.cash + voidedBuckets.cash
    const cashRefunds = voidedBuckets.cash
    const expectedCash = shift.startingCash + cashPayments - cashRefunds + shift.paidIn - shift.paidOut
    const cashDifference = actualCash - expectedCash

    const splitSales = completed
        .filter(tx => tx.paymentMethod === 'split')
        .reduce((s, tx) => s + tx.totalAmount, 0)

    return {
        ...shift,
        status: 'closed',
        closedAt,
        actualCash,
        expectedCash,
        cashDifference,
        grossSales,
        discounts,
        refunds,
        netSales,
        cashSales: completedBuckets.cash,
        gcashSales: completedBuckets.gcash,
        mayaSales: completedBuckets.maya,
        bankTransferSales: completedBuckets.bank_transfer,
        splitSales,
        syncStatus: 'pending',
        otherSales: completedBuckets.other,
        cashPayments,
        cashRefunds,
    }
}

export const useShiftStore = create<ShiftState>()((set, get) => ({
    currentShift: null,
    isEnding: false,

    ensureShiftOpen: async (user, branch) => {
        const openShifts = await db.shifts
            .where('branchId').equals(branch.id)
            .filter(s => s.status === 'open')
            .toArray()

        const existing = openShifts.find(s => s.cashierId === user.id)
        if (existing) {
            set({ currentShift: existing })
            return
        }

        // A previous cashier logged out without tapping "End Shift", leaving their
        // shift dangling open. Auto-close it (actual cash = expected, since nobody
        // counted the drawer) so its time window can't overlap the new shift and
        // double-count sales when it's eventually reported.
        for (const dangling of openShifts) {
            const closedAt = new Date().toISOString()
            const summary = await computeSummary(dangling, 0, closedAt)
            const { otherSales, cashPayments, cashRefunds, ...toStore } = summary
            toStore.actualCash = toStore.expectedCash
            toStore.cashDifference = 0
            await db.shifts.update(dangling.localRef, toStore)
        }
        if (openShifts.length > 0) get().syncPendingShifts()

        // Best-effort: keep shift numbers trending upward even across a device swap.
        let nextNumber = (await db.shifts.where('branchId').equals(branch.id).count()) + 1
        if (navigator.onLine) {
            try {
                const { data } = await supabase
                    .from('shifts')
                    .select('shift_number')
                    .eq('branch_id', branch.id)
                    .order('shift_number', { ascending: false })
                    .limit(1)
                if (data && data.length > 0) nextNumber = Math.max(nextNumber, data[0].shift_number + 1)
            } catch {
                // offline or query failed — local count stands
            }
        }

        const shift: LocalShift = {
            localRef: uuidv4(),
            branchId: branch.id,
            cashierId: user.id,
            cashierName: user.name,
            cashierRole: user.role,
            shiftNumber: nextNumber,
            status: 'open',
            openedAt: new Date().toISOString(),
            startingCash: 3000,
            paidIn: 0,
            paidOut: 0,
            syncStatus: 'pending',
        }

        await db.shifts.add(shift)
        set({ currentShift: shift })
        get().syncPendingShifts()
    },

    previewSummary: async (actualCash) => {
        const shift = get().currentShift
        if (!shift) return null
        return computeSummary(shift, actualCash, new Date().toISOString())
    },

    endShift: async (actualCash) => {
        const shift = get().currentShift
        if (!shift) return null

        set({ isEnding: true })
        try {
            const summary = await computeSummary(shift, actualCash, new Date().toISOString())
            const { otherSales, cashPayments, cashRefunds, ...toStore } = summary

            await db.shifts.update(shift.localRef, toStore)
            set({ currentShift: null, isEnding: false })
            get().syncPendingShifts()

            return summary
        } catch (err) {
            set({ isEnding: false })
            throw err
        }
    },

    syncPendingShifts: async () => {
        if (!navigator.onLine) return
        const pending = await db.shifts.where('syncStatus').anyOf(['pending', 'failed']).toArray()
        for (const local of pending) {
            try {
                const { data, error } = await supabase
                    .from('shifts')
                    .upsert(
                        {
                            branch_id: local.branchId,
                            cashier_id: local.cashierId,
                            cashier_name: local.cashierName,
                            cashier_role: local.cashierRole,
                            shift_number: local.shiftNumber,
                            local_ref: local.localRef,
                            status: local.status,
                            opened_at: local.openedAt,
                            closed_at: local.closedAt ?? null,
                            starting_cash: local.startingCash,
                            expected_cash: local.expectedCash ?? null,
                            actual_cash: local.actualCash ?? null,
                            cash_difference: local.cashDifference ?? null,
                            gross_sales: local.grossSales ?? null,
                            discounts: local.discounts ?? null,
                            refunds: local.refunds ?? null,
                            net_sales: local.netSales ?? null,
                            cash_sales: local.cashSales ?? null,
                            gcash_sales: local.gcashSales ?? null,
                            maya_sales: local.mayaSales ?? null,
                            bank_transfer_sales: local.bankTransferSales ?? null,
                            split_sales: local.splitSales ?? null,
                            paid_in: local.paidIn,
                            paid_out: local.paidOut,
                        },
                        { onConflict: 'local_ref', ignoreDuplicates: false }
                    )
                    .select('id')
                    .single()

                if (error) throw error
                await db.shifts.update(local.localRef, { syncStatus: 'synced', supabaseId: data.id })
            } catch {
                await db.shifts.update(local.localRef, { syncStatus: 'failed' })
            }
        }
    },
}))
