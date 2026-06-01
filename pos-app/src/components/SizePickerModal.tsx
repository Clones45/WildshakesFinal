import { motion, AnimatePresence } from 'framer-motion'
import type { Product } from '../lib/supabase'
import { getDeliveryPrice } from '../lib/deliveryPricing'

export interface SizeOption {
    sizeLabel: string   // "Regular" | "Petite" | "Grande"
    product: Product    // the actual product record for that size
}

interface SizePickerModalProps {
    baseName: string
    emoji: string
    options: SizeOption[]
    onSelect: (product: Product, sizeLabel: string) => void
    onClose: () => void
    deliveryPlatform?: 'foodpanda' | 'grab'
}

const SIZE_INFO: Record<string, { oz: string; desc: string; color: string }> = {
    Petite:  { oz: '16 oz', desc: 'Small',  color: '#a78bfa' },
    Grande:  { oz: '22 oz', desc: 'Large',  color: '#5b21b6' },
}

export function SizePickerModal({ baseName, emoji, options, onSelect, onClose, deliveryPlatform }: SizePickerModalProps) {
    return (
        <AnimatePresence>
            <motion.div
                key="backdrop"
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
                    key="modal"
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
                        maxWidth: '420px',
                        boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(124,58,237,0.08)',
                    }}
                >
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                        <div style={{
                            width: '72px', height: '72px',
                            borderRadius: '20px',
                            background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '36px', margin: '0 auto 14px',
                            boxShadow: '0 4px 16px rgba(124,58,237,0.15)',
                        }}>
                            {emoji}
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#1e1b4b', letterSpacing: '-0.02em' }}>
                            {baseName}
                        </h2>
                        <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#7c3aed', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            Select a size
                        </p>
                    </div>

                    {/* Size options */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {options.map((opt) => {
                            const info = SIZE_INFO[opt.sizeLabel] ?? { oz: '', desc: opt.sizeLabel, color: '#7c3aed' }
                            const isSoldOut = opt.product.is_available === false
                            return (
                                <motion.button
                                    key={opt.sizeLabel}
                                    whileTap={{ scale: isSoldOut ? 1 : 0.97 }}
                                    whileHover={{ scale: isSoldOut ? 1 : 1.01 }}
                                    onClick={() => !isSoldOut && onSelect(opt.product, opt.sizeLabel)}
                                    disabled={isSoldOut}
                                    style={{
                                        display: 'flex', alignItems: 'center',
                                        padding: '14px 18px',
                                        borderRadius: '14px',
                                        border: `2px solid ${isSoldOut ? '#e5e7eb' : info.color + '22'}`,
                                        background: isSoldOut ? '#f9fafb' : `${info.color}08`,
                                        cursor: isSoldOut ? 'not-allowed' : 'pointer', width: '100%',
                                        gap: '14px', textAlign: 'left',
                                        transition: 'border-color 0.15s, background 0.15s',
                                        opacity: isSoldOut ? 0.6 : 1,
                                    }}
                                    onMouseEnter={e => {
                                        if (isSoldOut) return;
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = info.color
                                        ;(e.currentTarget as HTMLButtonElement).style.background = `${info.color}14`
                                    }}
                                    onMouseLeave={e => {
                                        if (isSoldOut) return;
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = `${info.color}22`
                                        ;(e.currentTarget as HTMLButtonElement).style.background = `${info.color}08`
                                    }}
                                >
                                    {/* Size pill */}
                                    <div style={{
                                        width: '52px', height: '52px', borderRadius: '12px',
                                        background: isSoldOut ? '#f3f4f6' : `linear-gradient(135deg, ${info.color}22, ${info.color}10)`,
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, border: `1px solid ${isSoldOut ? '#e5e7eb' : info.color + '30'}`,
                                    }}>
                                        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: isSoldOut ? '#9ca3af' : info.color, lineHeight: 1 }}>
                                            {opt.sizeLabel === 'Regular' ? 'R' : opt.sizeLabel === 'Petite' ? 'P' : 'G'}
                                        </span>
                                        {info.oz && (
                                            <span style={{ fontSize: '0.6rem', color: isSoldOut ? '#9ca3af' : info.color, opacity: 0.7, marginTop: '2px' }}>
                                                {info.oz}
                                            </span>
                                        )}
                                    </div>

                                    {/* Labels */}
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: isSoldOut ? '#9ca3af' : '#1e1b4b' }}>
                                            {opt.sizeLabel}
                                        </p>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.77rem', color: isSoldOut ? '#d1d5db' : '#6b7280', fontWeight: 500 }}>
                                            {info.desc} · {info.oz}
                                        </p>
                                    </div>

                                    {/* Price or Sold Out Label */}
                                    {isSoldOut ? (
                                        <span style={{
                                            fontWeight: 800, fontSize: '0.85rem',
                                            color: '#ef4444', background: '#fee2e2',
                                            padding: '4px 8px', borderRadius: '6px',
                                        }}>
                                            Sold Out
                                        </span>
                                    ) : (() => {
                                        const delPrice = deliveryPlatform
                                            ? getDeliveryPrice(opt.product.name, opt.sizeLabel)
                                            : null
                                        const showDel = delPrice !== null && delPrice !== opt.product.price
                                        return (
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{
                                                    fontWeight: 900, fontSize: '1.15rem',
                                                    color: info.color, letterSpacing: '-0.02em',
                                                    display: 'block',
                                                }}>
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
