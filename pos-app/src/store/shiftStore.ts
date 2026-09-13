import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { db, type LocalShift, type LocalTransaction } from '../lib/db'
import { supabase } from '../lib/supabase'
import type { UserProfile, Branch } from '../lib/supabase'

export interface ShiftSummary extends LocalShift {
    otherSales: number    // delivery (FoodPanda + Grab) sales — receipt-only
    cashPayments: number  // gross cash taken in this shift, before voids — receipt-only
    cashRefunds: number   // cash given back on voided sales this shift — receipt-only
}

/** The percentage each delivery platform keeps of its gross, entered at close. */
export interface PlatformCommission {
    foodpandaCommissionPct: number
    grabCommissionPct: number
}

// How long a shift that failed to sync waits before the next attempt.
const SHIFT_RETRY_AFTER_MS = 5 * 60 * 1000
const DEFAULT_STARTING_CASH = 3000
const LAST_STARTING_CASH_KEY = 'ws_last_starting_cash'
const LAST_COMMISSION_KEY = 'ws_last_platform_commission'

// The tablet remembers what was entered last time, so the usual case is one tap.
export function rememberedStartingCash(): number {
    const v = Number(localStorage.getItem(LAST_STARTING_CASH_KEY))
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_STARTING_CASH
}

export function rememberedCommission(): PlatformCommission {
    try {
        const v = JSON.parse(localStorage.getItem(LAST_COMMISSION_KEY) ?? '')
        return { foodpandaCommissionPct: Number(v.foodpandaCommissionPct) || 0, grabCommissionPct: Number(v.grabCommissionPct) || 0 }
    } catch {
        return { foodpandaCommissionPct: 0, grabCommissionPct: 0 }
    }
}

interface ShiftState {
    currentShift: LocalShift | null
    /** This cashier has no open shift; they must enter the starting cash to begin one. */
    awaitingStart: boolean
    isEnding: boolean
    ensureShiftOpen: (user: UserProfile, branch: Branch) => Promise<void>
    startShift: (user: UserProfile, branch: Branch, startingCash: number) => Promise<void>
    previewSummary: (commission: PlatformCommission) => Promise<ShiftSummary | null>
    endShift: (commission: PlatformCommission) => Promise<ShiftSummary | null>
    syncPendingShifts: () => Promise<void>
}

const round2 = (n: number) => Math.round(n * 100) / 100

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
//
// Cash is not counted at close: the drawer is taken as expected (starting cash
// entered at the start of the shift, plus cash taken, minus cash refunded).
// `countedCash` exists only so shifts closed under the old counted flow keep
// their recorded figure on a reprint.
async function computeSummary(
    shift: LocalShift,
    closedAt: string,
    commission?: PlatformCommission,
    countedCash?: number,
): Promise<ShiftSummary> {
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
    const actualCash = countedCash ?? expectedCash
    const cashDifference = actualCash - expectedCash

    const splitSales = completed
        .filter(tx => tx.paymentMethod === 'split')
        .reduce((s, tx) => s + tx.totalAmount, 0)

    // Delivery: what each platform sold (at the platform's prices) and what it keeps.
    const platformSales = (p: 'foodpanda' | 'grab') =>
        completed.filter(tx => tx.deliveryPlatform === p).reduce((s, tx) => s + tx.totalAmount, 0)
    const foodpandaSales = platformSales('foodpanda')
    const grabSales = platformSales('grab')
    const foodpandaCommissionPct = commission?.foodpandaCommissionPct ?? 0
    const grabCommissionPct = commission?.grabCommissionPct ?? 0
    const foodpandaCommission = round2(foodpandaSales * foodpandaCommissionPct / 100)
    const grabCommission = round2(grabSales * grabCommissionPct / 100)
    const netAfterCommission = round2(netSales - foodpandaCommission - grabCommission)

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
        foodpandaSales,
        grabSales,
        foodpandaCommissionPct,
        grabCommissionPct,
        foodpandaCommission,
        grabCommission,
        netAfterCommission,
        syncStatus: 'pending',
        otherSales: foodpandaSales + grabSales,
        cashPayments,
        cashRefunds,
    }
}

// The figures a reprint should carry. Shifts closed since the receipt-only
// numbers started being stored are returned as-is; older ones are rebuilt from
// this tablet's sales, which is the best available (and how they were first printed).
export async function summaryForReprint(shift: LocalShift): Promise<ShiftSummary> {
    if (shift.otherSales !== undefined && shift.cashPayments !== undefined && shift.cashRefunds !== undefined) {
        return shift as ShiftSummary
    }
    const rebuilt = await computeSummary(
        shift,
        shift.closedAt ?? new Date().toISOString(),
        { foodpandaCommissionPct: shift.foodpandaCommissionPct ?? 0, grabCommissionPct: shift.grabCommissionPct ?? 0 },
        shift.actualCash,
    )
    return {
        ...rebuilt,
        ...shift,   // the stored close wins for everything it has
        otherSales: rebuilt.otherSales,
        cashPayments: rebuilt.cashPayments,
        cashRefunds: rebuilt.cashRefunds,
    }
}

export const useShiftStore = create<ShiftState>()((set, get) => ({
    currentShift: null,
    awaitingStart: false,
    isEnding: false,

    ensureShiftOpen: async (user, branch) => {
        const openShifts = await db.shifts
            .where('branchId').equals(branch.id)
            .filter(s => s.status === 'open')
            .toArray()

        const existing = openShifts.find(s => s.cashierId === user.id)
        if (existing) {
            set({ currentShift: existing, awaitingStart: false })
            return
        }

        // A previous cashier logged out without tapping "End Shift", leaving their
        // shift dangling open. Auto-close it (cash taken as expected, since nobody
        // was there) so its time window can't overlap the new shift and
        // double-count sales when it's eventually reported.
        for (const dangling of openShifts) {
            const summary = await computeSummary(dangling, new Date().toISOString())
            await db.shifts.put(summary)
        }
        if (openShifts.length > 0) get().syncPendingShifts()

        // No shift yet: the cashier enters the starting cash first (StartShiftModal
        // calls startShift). Nothing opens until they do.
        set({ currentShift: null, awaitingStart: true })
    },

    startShift: async (user, branch, startingCash) => {
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
            startingCash,
            paidIn: 0,
            paidOut: 0,
            syncStatus: 'pending',
        }

        await db.shifts.add(shift)
        localStorage.setItem(LAST_STARTING_CASH_KEY, String(startingCash))
        set({ currentShift: shift, awaitingStart: false })
        get().syncPendingShifts()
    },

    previewSummary: async (commission) => {
        const shift = get().currentShift
        if (!shift) return null
        return computeSummary(shift, new Date().toISOString(), commission)
    },

    endShift: async (commission) => {
        const shift = get().currentShift
        if (!shift) return null

        set({ isEnding: true })
        try {
            const summary = await computeSummary(shift, new Date().toISOString(), commission)

            // Stored whole, receipt-only figures included, so a reprint is exact.
            await db.shifts.put(summary)
            localStorage.setItem(LAST_COMMISSION_KEY, JSON.stringify(commission))
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
        const now = Date.now()
        for (const local of pending) {
            // A shift whose sync just failed gets a breather instead of a retry on
            // every 30-second cycle. The usual cause is server-side (a policy that
            // refuses the write), which hammering never fixes — it only fills the
            // logs; see add_shifts_update_policy_migration.sql for the one it did.
            if (
                local.syncStatus === 'failed' && local.lastSyncAttempt &&
                now - new Date(local.lastSyncAttempt).getTime() < SHIFT_RETRY_AFTER_MS
            ) continue
            try {
                const row = {
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
                }
                // Delivery columns are newer (see add_shift_platform_commission_migration.sql).
                // Until that migration has been run the server rejects them as unknown,
                // so retry without rather than leave the shift stuck unsynced.
                const extras: Record<string, unknown> = local.netAfterCommission !== undefined
                    ? {
                        foodpanda_sales: local.foodpandaSales ?? 0,
                        grab_sales: local.grabSales ?? 0,
                        foodpanda_commission_pct: local.foodpandaCommissionPct ?? 0,
                        grab_commission_pct: local.grabCommissionPct ?? 0,
                        foodpanda_commission: local.foodpandaCommission ?? 0,
                        grab_commission: local.grabCommission ?? 0,
                        net_after_commission: local.netAfterCommission,
                    }
                    : {}
                const upsert = (payload: Record<string, unknown>) => supabase
                    .from('shifts')
                    .upsert(payload, { onConflict: 'local_ref', ignoreDuplicates: false })
                    .select('id')
                    .single()

                let { data, error } = await upsert({ ...row, ...extras })
                const unknownColumn = error && (error.code === 'PGRST204' || /column/i.test(error.message ?? ''))
                if (unknownColumn && Object.keys(extras).length > 0) {
                    ({ data, error } = await upsert(row))
                }

                if (error) throw error
                if (!data) throw new Error('Shift sync returned no row')
                await db.shifts.update(local.localRef, { syncStatus: 'synced', supabaseId: data.id })
            } catch (err) {
                console.warn(`[shifts] Shift #${local.shiftNumber} did not sync:`, (err as { message?: string })?.message ?? err)
                await db.shifts.update(local.localRef, { syncStatus: 'failed', lastSyncAttempt: new Date().toISOString() })
            }
        }
    },
}))
