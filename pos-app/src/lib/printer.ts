/**
 * printer.ts — Native Bluetooth printing for Wildshakes POS
 *
 * Sends plain-text ESC/POS-compatible tickets to the paired
 * thermal printer (Vozy P50 / any SPP device) via the native plugin.
 */

import { registerPlugin } from '@capacitor/core'
import { toast } from 'react-hot-toast'
import type { HeldOrder } from '../store/holdStore'
import type { CartItem } from '../store/cartStore'
import type { LocalTransaction } from './db'

export interface NativePrinterPlugin {
    printBase64(options: { address: string; data: string }): Promise<void>
}
const NativePrinter = registerPlugin<NativePrinterPlugin>('NativePrinter')

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

// ── Base64 & Logo Helpers ───────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
}

async function buildLogoBytes(imageUrl: string, targetWidth = 256): Promise<Uint8Array> {
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
            try {
                const scale    = targetWidth / img.width
                const w        = targetWidth
                const h        = Math.round(img.height * scale)

                const canvas = document.createElement('canvas')
                canvas.width  = w
                canvas.height = h
                const ctx = canvas.getContext('2d')!

                ctx.fillStyle = '#ffffff'
                ctx.fillRect(0, 0, w, h)
                ctx.drawImage(img, 0, 0, w, h)

                const { data } = ctx.getImageData(0, 0, w, h)
                const bytes: number[] = []

                // Initialize printer
                bytes.push(0x1b, 0x40)

                // Center align logo
                bytes.push(0x1b, 0x61, 0x01)

                // Set line spacing to 24 dots for seamless vertical merging
                bytes.push(0x1b, 0x33, 24)

                // Process image in vertical bands of 24 dots (ESC * 33)
                for (let yStart = 0; yStart < h; yStart += 24) {
                    bytes.push(0x1b, 0x2a, 33) // ESC * 33 (24-dot double density)
                    bytes.push(w & 0xff, (w >> 8) & 0xff) // nL, nH
                    
                    for (let x = 0; x < w; x++) {
                        for (let k = 0; k < 3; k++) {
                            let byte = 0
                            for (let b = 0; b < 8; b++) {
                                const y = yStart + k * 8 + b
                                if (y < h) {
                                    const i = (y * w + x) * 4
                                    // Calculate luminance
                                    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
                                    if (lum < 128) {
                                        byte |= (1 << (7 - b)) // Set bit if dark
                                    }
                                }
                            }
                            bytes.push(byte)
                        }
                    }
                    bytes.push(0x0a) // Print and feed line
                }

                // Reset line spacing to default (ESC 2)
                bytes.push(0x1b, 0x32)
                
                // Reset alignment to left
                bytes.push(0x1b, 0x61, 0x00)

                resolve(new Uint8Array(bytes))
            } catch {
                resolve(new Uint8Array(0))
            }
        }
        img.onerror = () => resolve(new Uint8Array(0))
        img.src = imageUrl
    })
}

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
        const textBytes = new TextEncoder().encode(text)
        const base64Data = uint8ToBase64(textBytes)
        await NativePrinter.printBase64({ address, data: base64Data })
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

    const activeItems = transaction.items.filter(i => !(i as any).cancelled)

    const itemLines = activeItems.flatMap(item => {
        const rows: string[] = []
        rows.push(leftRight(item.productName.slice(0, W - 10), `P${item.subtotal.toFixed(2)}`))
        rows.push(`  ${item.quantity}x x P${item.unitPrice.toFixed(2)}`)
        if ((item as any).notes)
            rows.push(`  Note: ${(item as any).notes}`.slice(0, W))
        return rows
    })

    const orderTypeLabel = transaction.orderType === 'take-out' ? 'Take-out' : 'Dine-in'

    const subtotal = transaction.totalAmount + transaction.discountAmount

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
        // ── Branch & Employee (logo is prepended by printReceipt as ESC/POS bitmap) ──
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
        // ── Ref / Date (no Table shown on receipt) ──
        `Ref#: ${shortRef}`,
        `Date: ${dateStr} ${timeStr}`,
        divider,
        // ── Active items only (cancelled items excluded) ──
        ...itemLines,
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
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isNative) {
        toast.error('Bluetooth printing only works in the tablet app.')
        return
    }

    const address = localStorage.getItem(BT_PRINTER_KEY)
    if (!address) {
        toast.error('No printer selected.')
        return
    }

    const printingToast = toast.loading('Printing Receipt…')
    try {
        const logoBytes = await buildLogoBytes('/Logo 1.png', 256).catch(() => new Uint8Array(0))
        const textStr   = buildReceiptText(transaction, branchName, cashierName, branchEmail, branchLocation)
        const textBytes = new TextEncoder().encode(textStr)

        const combined = new Uint8Array(logoBytes.length + textBytes.length)
        combined.set(logoBytes)
        combined.set(textBytes, logoBytes.length)

        const base64Data = uint8ToBase64(combined)
        await NativePrinter.printBase64({ address, data: base64Data })

        toast.success('Receipt printed!', { id: printingToast })
    } catch (err: any) {
        toast.error(`Print failed: ${err?.message ?? 'Unknown error'}`, { id: printingToast })
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

    const normalizedItems = (orderItems as any[])
        .filter((item) => !item.cancelled)   // ← skip cancelled items
        .map((item) => ({
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
