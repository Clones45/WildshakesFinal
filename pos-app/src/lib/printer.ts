import type { HeldOrder } from '../store/holdStore'
import type { CartItem } from '../store/cartStore'

export function printKitchenTicket(orderItems: CartItem[] | HeldOrder['items'], tableNumber: string | null, orderId: string, createdAt: string) {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) return

    const timeStr = new Date(createdAt).toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
    })

    const shortId = orderId.slice(-4).toUpperCase()

    // Normalize items array
    const normalizedItems = orderItems.map((item: any) => ({
        quantity: item.quantity,
        name: item.item_name || item.product?.name || 'Unknown Item'
    }))

    doc.open()
    doc.write(`
        <html>
            <head>
                <style>
                    body { font-family: monospace; font-size: 14px; margin: 0; padding: 10px; color: black; }
                    .header { text-align: center; font-weight: bold; margin-bottom: 10px; font-size: 18px; }
                    .meta { margin-bottom: 10px; font-size: 14px; line-height: 1.4; }
                    .item { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 16px; font-weight: bold; }
                    .divider { border-bottom: 1px dashed black; margin: 10px 0; }
                </style>
            </head>
            <body>
                <div class="header">*** KITCHEN TICKET ***</div>
                <div class="meta">
                    <strong>Table: ${tableNumber || 'Takeout / None'}</strong><br/>
                    Time: ${timeStr}<br/>
                    Order: #${shortId}
                </div>
                <div class="divider"></div>
                ${normalizedItems.map(item => `
                    <div class="item">
                        <span>[${item.quantity}x] ${item.name}</span>
                    </div>
                `).join('')}
                <div class="divider"></div>
                <div class="header">*** END TICKET ***</div>
            </body>
        </html>
    `)
    doc.close()

    setTimeout(() => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setTimeout(() => document.body.removeChild(iframe), 1000)
    }, 250)
}
