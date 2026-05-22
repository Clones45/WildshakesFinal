/**
 * printer.ts — Native Bluetooth printing for Wildshakes POS
 *
 * Sends plain-text ESC/POS-compatible tickets to the paired
 * thermal printer (Vozy P50 / any SPP device) via the native plugin.
 */

import { BluetoothPrinter } from '@kduma-autoid/capacitor-bluetooth-printer'
import { toast } from 'react-hot-toast'
import type { HeldOrder } from '../store/holdStore'
import type { CartItem } from '../store/cartStore'
import type { LocalTransaction } from './db'

const BT_PRINTER_KEY = 'nexus_bt_printer_address'
const W = 32

// ── Formatting helpers ──────────────────────────────────────────────────────

const center = (str: string): string => {
    const s = str.slice(0, W)
    const pad = Math.max(0, Math.floor((W - s.length) / 2))
    return ' '.repeat(pad) + s
}

const leftRight = (left: string, right: string): string => {
    const maxLeft = W - right.length - 1
    const l = left.slice(0, maxLeft)
    const gap = W - l.length - right.length
    return l + ' '.repeat(Math.max(1, gap)) + right
}

const divider = '-'.repeat(W)

// ── Core Bluetooth sender ───────────────────────────────────────────────────

async function sendToPrinter(text: string, label: string): Promise<void> {
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isNative) {
        toast.error('Bluetooth printing only works in the tablet app.')
        return
    }

    const address = localStorage.getItem(BT_PRINTER_KEY)
    if (!address) {
        toast.error('No printer selected. Set one via the 🔵 icon in the receipt screen.')
        return
    }

    const printingToast = toast.loading(`Printing ${label}…`)
    try {
        await BluetoothPrinter.connectAndPrint({ address, data: text })
        toast.success(`${label} printed!`, { id: printingToast })
    } catch (err: any) {
        toast.error(`Print failed: ${err?.message ?? 'Check Bluetooth connection'}`, { id: printingToast })
    }
}

// ── Receipt (Customer Copy) ─────────────────────────────────────────────────

export function buildReceiptText(
    transaction: LocalTransaction,
    branchName: string,
    cashierName: string,
    branchEmail?: string,
    branchLocation?: string,
): string {
    const now = new Date(transaction.createdAt)
    const dateStr = now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
    const shortRef = transaction.localRef.slice(-8).toUpperCase()

    const activeItems   = transaction.items.filter(i => !(i as any).cancelled)
    const cancelledItems = transaction.items.filter(i =>  (i as any).cancelled)

    const itemLines = activeItems.flatMap(item => {
        const rows: string[] = []
        rows.push(leftRight(item.productName.slice(0, W - 10), `P${item.subtotal.toFixed(2)}`))
        rows.push(`  ${item.quantity}x x P${item.unitPrice.toFixed(2)}`)
        if ((item as any).notes)
            rows.push(`  Note: ${(item as any).notes}`.slice(0, W))
        return rows
    })

    const cancelledLines = cancelledItems.length > 0
        ? [divider, center('CANCELLED (not charged)'),
           ...cancelledItems.map(i => `[X] ${i.productName}`.slice(0, W))]
        : []

    const subtotal = transaction.totalAmount + transaction.discountAmount
    const orderTypeLabel = transaction.orderType === 'take-out' ? 'Take-out' : 'Dine-in'

    const totalLines: string[] = []
    totalLines.push(leftRight('Subtotal', `P${subtotal.toFixed(2)}`))
    if (transaction.discountAmount > 0)
        totalLines.push(leftRight(`${transaction.discountType} disc.`, `-P${transaction.discountAmount.toFixed(2)}`))
    totalLines.push(divider)
    totalLines.push(leftRight('TOTAL', `P${transaction.totalAmount.toFixed(2)}`))
    totalLines.push(leftRight(transaction.paymentMethod.replace(/_/g, ' ').toUpperCase(), `P${transaction.totalAmount.toFixed(2)}`))
    if (transaction.referenceNumber)
        totalLines.push(leftRight('Ref#', transaction.referenceNumber))

    return [
        // ── Header ──
        center(branchName),
        ...(branchLocation ? [center(branchLocation)] : []),
        ...(branchEmail ? [center(branchEmail)] : []),
        center('**TRANSACTION RECEIPT**'),
        divider,
        // ── Meta ──
        `Employee: ${cashierName}`.slice(0, W),
        `POS: ${branchName}`.slice(0, W),
        divider,
        orderTypeLabel,
        divider,
        // ── Ref / Table ──
        `Ref#: ${shortRef}`,
        ...(transaction.tableNumber ? [`Table: #${transaction.tableNumber}`] : []),
        `Date: ${dateStr} ${timeStr}`,
        divider,
        // ── Items ──
        ...itemLines,
        ...cancelledLines,
        divider,
        // ── Totals ──
        ...totalLines,
        divider,
        // ── Footer ──
        center('***TRANSACTION RECEIPT ONLY,'),
        center('THIS IS NOT AN OFFICIAL RECEIPT***'),
        '\n\n\n',
    ].join('\n')
}

export async function printReceipt(
    transaction: LocalTransaction,
    branchName: string,
    cashierName: string,
    branchEmail?: string,
    branchLocation?: string,
): Promise<void> {
    await sendToPrinter(buildReceiptText(transaction, branchName, cashierName, branchEmail, branchLocation), 'Receipt')
}

// ── Kitchen Ticket ──────────────────────────────────────────────────────────

export async function printKitchenTicket(
    orderItems: CartItem[] | HeldOrder['items'],
    tableNumber: string | null,
    orderId: string,
    createdAt: string
): Promise<void> {
    const timeStr = new Date(createdAt).toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    })
    const shortId = orderId.slice(-4).toUpperCase()

    const normalizedItems = (orderItems as any[]).map((item) => ({
        quantity: item.quantity,
        name: (item.item_name || item.product?.name || 'Unknown Item') as string,
        variant: (item.variant ?? '') as string,
        notes: (item.notes ?? '') as string,
    }))

    const lines: string[] = [
        center('*** KITCHEN TICKET ***'),
        divider,
        leftRight('Table:', tableNumber || 'Takeout / None'),
        leftRight('Time:', timeStr),
        leftRight('Order:', `#${shortId}`),
        divider,
        ...normalizedItems.flatMap((item) => {
            const label = `[${item.quantity}x] ${item.name}`
            const rows: string[] = [label.slice(0, W)]
            if (item.variant) rows.push(`  Flavor: ${item.variant}`.slice(0, W))
            if (item.notes)   rows.push(`  Note: ${item.notes}`.slice(0, W))
            return rows
        }),
        divider,
        center('*** END TICKET ***'),
        '\n\n\n',
    ]

    await sendToPrinter(lines.join('\n'), 'Kitchen ticket')
}
