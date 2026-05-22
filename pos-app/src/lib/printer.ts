/**
 * printer.ts — Native Bluetooth printing for Wildshakes POS
 *
 * Uses @kduma-autoid/capacitor-bluetooth-printer to send plain-text tickets
 * directly to the paired thermal printer (Vozy P50 / any SPP device).
 *
 * Printer address is persisted in localStorage under BT_PRINTER_KEY,
 * set once via the Bluetooth icon in ReceiptModal.
 */

import { BluetoothPrinter } from '@kduma-autoid/capacitor-bluetooth-printer'
import { toast } from 'react-hot-toast'
import type { HeldOrder } from '../store/holdStore'
import type { CartItem } from '../store/cartStore'

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

// ── Core print function ─────────────────────────────────────────────────────

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

    // Normalize items — supports both CartItem and HeldOrder item shapes
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
