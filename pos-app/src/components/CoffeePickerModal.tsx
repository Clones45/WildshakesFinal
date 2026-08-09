import { motion, AnimatePresence } from 'framer-motion'
import type { Product } from '../lib/supabase'
import { getDeliveryPrice } from '../lib/deliveryPricing'

export interface CoffeeOption {
    label: 'Hot' | 'Cold'
    product: Product
}

interface CoffeePickerModalProps {
    baseName: string
    options: CoffeeOption[]
    onSelect: (product: Product, tempLabel: 'Hot' | 'Cold') => void
    onClose: () => void
    deliveryPlatform?: 'foodpanda' | 'grab'
}

const TEMP_INFO: Record<string, { icon: string; desc: string; color: string; bg: string }> = {
    Hot:  { icon: '☕', desc: 'Served warm',   color: '#b45309', bg: '#fef3c7' },
    Cold: { icon: '🧊', desc: 'Served iced',   color: '#0369a1', bg: '#e0f2fe' },
}

export function CoffeePickerModal({ baseName, options, onSelect, onClose, deliveryPlatform }: CoffeePickerModalProps) {
    return (
        <AnimatePresence>
            <motion.div
                key="coffee-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(10, 10, 20, 0.65)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                <motion.div
                    key="coffee-modal"
                    initial={{ opacity: 0, scale: 0.88, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.88, y: 30 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: '#fff',
                        borderRadius: '24px',
                        padding: '32px 28px 28px',
                        width: '100%',
                        maxWidth: '400px',
                        boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(180,83,9,0.08)',
                    }}
                >
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                        <div style={{
                            width: '72px', height: '72px',
                            borderRadius: '20px',
                            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '36px', margin: '0 auto 14px',
                            boxShadow: '0 4px 16px rgba(180,83,9,0.15)',
                        }}>
                            ☕
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#1e1b4b', letterSpacing: '-0.02em' }}>
                            {baseName}
                        </h2>
                        <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#b45309', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            Hot or Cold?
                        </p>
                    </div>

                    {/* Temperature options */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {options.map((opt) => {
                            const info = TEMP_INFO[opt.label]
                            const isSoldOut = opt.product.is_available === false
                            return (
                                <motion.button
                                    key={opt.label}
                                    whileTap={{ scale: isSoldOut ? 1 : 0.97 }}
                                    whileHover={{ scale: isSoldOut ? 1 : 1.01 }}
                                    onClick={() => !isSoldOut && onSelect(opt.product, opt.label)}
                                    disabled={isSoldOut}
                                    style={{
                                        display: 'flex', alignItems: 'center',
                                        padding: '16px 18px',
                                        borderRadius: '14px',
                                        border: `2px solid ${isSoldOut ? '#e5e7eb' : info.color + '30'}`,
                                        background: isSoldOut ? '#f9fafb' : `${info.bg}66`,
                                        cursor: isSoldOut ? 'not-allowed' : 'pointer', width: '100%',
                                        gap: '14px', textAlign: 'left',
                                        transition: 'border-color 0.15s, background 0.15s',
                                        opacity: isSoldOut ? 0.55 : 1,
                                    }}
                                    onMouseEnter={e => {
                                        if (isSoldOut) return
                                        ;(e.currentTarget as HTMLButtonElement).style.borderColor = info.color
                                        ;(e.currentTarget as HTMLButtonElement).style.background = info.bg
                                    }}
                                    onMouseLeave={e => {
                                        if (isSoldOut) return
                                        ;(e.currentTarget as HTMLButtonElement).style.borderColor = `${info.color}30`
                                        ;(e.currentTarget as HTMLButtonElement).style.background = `${info.bg}66`
                                    }}
                                >
                                    {/* Icon */}
                                    <div style={{
                                        width: '56px', height: '56px', borderRadius: '14px',
                                        background: isSoldOut ? '#f3f4f6' : info.bg,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, border: `1px solid ${isSoldOut ? '#e5e7eb' : info.color + '30'}`,
                                        fontSize: '1.7rem',
                                    }}>
                                        {info.icon}
                                    </div>

                                    {/* Labels */}
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontWeight: 800, fontSize: '1.05rem', color: isSoldOut ? '#9ca3af' : '#1e1b4b' }}>
                                            {opt.label}
                                        </p>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.77rem', color: isSoldOut ? '#d1d5db' : '#6b7280', fontWeight: 500 }}>
                                            {info.desc}
                                        </p>
                                    </div>

                                    {/* Price / Sold Out */}
                                    {isSoldOut ? (
                                        <span style={{
                                            fontWeight: 800, fontSize: '0.85rem',
                                            color: '#ef4444', background: '#fee2e2',
                                            padding: '4px 8px', borderRadius: '6px',
                                        }}>
                                            Sold Out
                                        </span>
                                    ) : (() => {
                                        const tempKey = opt.label as 'Hot' | 'Cold'
                                        const delPrice = deliveryPlatform
                                            ? getDeliveryPrice(opt.product.name, tempKey, opt.product.category)
                                            : null
                                        const showDel = delPrice !== null && delPrice !== opt.product.price
                                        return (
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: 900, fontSize: '1.2rem', color: info.color, letterSpacing: '-0.02em', display: 'block' }}>
                                                    ₱{(delPrice ?? opt.product.price).toFixed(2)}
                                                </span>
                                                {showDel && (
                                                    <span style={{ fontSize: '0.68rem', color: '#9ca3af', textDecoration: 'line-through', display: 'block' }}>
                                                        ₱{opt.product.price.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </motion.button>
                            )
                        })}
                    </div>

                    {/* Cancel */}
                    <button
                        onClick={onClose}
                        style={{
                            marginTop: '18px', width: '100%',
                            padding: '11px', borderRadius: '12px',
                            border: '1.5px solid #e5e7eb',
                            background: 'transparent', cursor: 'pointer',
                            fontSize: '0.88rem', fontWeight: 700, color: '#9ca3af',
                            transition: 'color 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6b7280'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb' }}
                    >
                        Cancel
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
