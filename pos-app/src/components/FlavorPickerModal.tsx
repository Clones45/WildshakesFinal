import { motion, AnimatePresence } from 'framer-motion'
import type { Product } from '../lib/supabase'
import { useFriesStockStore } from '../store/friesStockStore'

export type FriesFlavor = 'Cheese' | 'BBQ' | 'Sour Cream'

export const FRIES_FLAVORS: FriesFlavor[] = ['Cheese', 'BBQ', 'Sour Cream']

// Helper to determine if a product name should trigger the flavor picker
export function requiresFriesFlavor(productName: string): boolean {
    return productName.toLowerCase().includes('fries')
}

const FLAVOR_INFO: Record<FriesFlavor, { emoji: string; color: string; desc: string }> = {
    'Cheese':     { emoji: '🧀', color: '#f59e0b', desc: 'Creamy cheddar seasoning' },
    'BBQ':        { emoji: '🍖', color: '#dc2626', desc: 'Smoky & savory BBQ blend' },
    'Sour Cream': { emoji: '🥛', color: '#6366f1', desc: 'Tangy sour cream & onion' },
}

interface FlavorPickerModalProps {
    product: Product
    onSelect: (product: Product, flavor: FriesFlavor) => void
    onClose: () => void
}

export function FlavorPickerModal({ product, onSelect, onClose }: FlavorPickerModalProps) {
    const isFlavorAvailable = useFriesStockStore(state => state.isFlavorAvailable)

    return (
        <AnimatePresence>
            <motion.div
                key="flavor-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(10, 10, 20, 0.65)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '16px',
                }}
            >
                <motion.div
                    key="flavor-modal"
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
                        boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(245,158,11,0.08)',
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
                            boxShadow: '0 4px 16px rgba(245,158,11,0.2)',
                        }}>
                            🍟
                        </div>
                        <h2 style={{
                            margin: 0, fontSize: '1.3rem', fontWeight: 800,
                            color: '#1e1b4b', letterSpacing: '-0.02em',
                        }}>
                            {product.name}
                        </h2>
                        <p style={{
                            margin: '4px 0 0', fontSize: '0.82rem',
                            color: '#f59e0b', fontWeight: 600,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                            Choose a Flavor
                        </p>
                    </div>

                    {/* Flavor options */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {FRIES_FLAVORS.map((flavor) => {
                            const info = FLAVOR_INFO[flavor]
                            const isSoldOut = !isFlavorAvailable(flavor)
                            return (
                                <motion.button
                                    key={flavor}
                                    whileTap={{ scale: isSoldOut ? 1 : 0.97 }}
                                    whileHover={{ scale: isSoldOut ? 1 : 1.01 }}
                                    onClick={() => !isSoldOut && onSelect(product, flavor)}
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
                                    onMouseEnter={(e) => {
                                        if (isSoldOut) return;
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = info.color
                                        ;(e.currentTarget as HTMLButtonElement).style.background = `${info.color}14`
                                    }}
                                    onMouseLeave={(e) => {
                                        if (isSoldOut) return;
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = `${info.color}22`
                                        ;(e.currentTarget as HTMLButtonElement).style.background = `${info.color}08`
                                    }}
                                >
                                    {/* Flavor icon */}
                                    <div style={{
                                        width: '52px', height: '52px', borderRadius: '12px',
                                        background: isSoldOut ? '#f3f4f6' : `linear-gradient(135deg, ${info.color}22, ${info.color}10)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '26px', flexShrink: 0,
                                        border: `1px solid ${isSoldOut ? '#e5e7eb' : info.color + '30'}`,
                                    }}>
                                        <span style={{ opacity: isSoldOut ? 0.4 : 1, filter: isSoldOut ? 'grayscale(100%)' : 'none' }}>
                                            {info.emoji}
                                        </span>
                                    </div>

                                    {/* Labels */}
                                    <div style={{ flex: 1 }}>
                                        <p style={{
                                            margin: 0, fontWeight: 800,
                                            fontSize: '1rem', color: isSoldOut ? '#9ca3af' : '#1e1b4b',
                                        }}>
                                            {flavor}
                                        </p>
                                        <p style={{
                                            margin: '2px 0 0', fontSize: '0.77rem',
                                            color: isSoldOut ? '#d1d5db' : '#6b7280', fontWeight: 500,
                                        }}>
                                            {info.desc}
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
                                    ) : (
                                        <span style={{
                                            fontWeight: 900, fontSize: '1.1rem',
                                            color: info.color, letterSpacing: '-0.02em',
                                        }}>
                                            ₱{product.price.toFixed(2)}
                                        </span>
                                    )}
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
                        onMouseEnter={(e) => {
                            ;(e.currentTarget as HTMLButtonElement).style.color = '#6b7280'
                            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'
                        }}
                        onMouseLeave={(e) => {
                            ;(e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'
                            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'
                        }}
                    >
                        Cancel
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
