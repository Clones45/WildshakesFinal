import { motion, AnimatePresence } from 'framer-motion'

export type PearlOption = 'Regular Pearls' | 'Add-on Pearls' | 'No Pearls'

interface PearlsPickerModalProps {
    baseName: string        // e.g. "Caramel Machiato"
    sizeLabel: string       // e.g. "Grande"
    basePrice: number       // price of the chosen size variant
    emoji: string
    onSelect: (pearl: PearlOption, finalPrice: number) => void
    onClose: () => void
}

const PEARL_OPTIONS: { option: PearlOption; addonPrice: number; icon: string; desc: string; color: string }[] = [
    {
        option: 'Regular Pearls',
        addonPrice: 0,
        icon: '⚪',
        desc: 'Standard tapioca pearls included',
        color: '#7c3aed',
    },
    {
        option: 'Add-on Pearls',
        addonPrice: 25,
        icon: '🫧',
        desc: 'Extra pearls for bubble lovers!',
        color: '#0ea5e9',
    },
    {
        option: 'No Pearls',
        addonPrice: 0,
        icon: '🚫',
        desc: 'No pearls in this drink',
        color: '#6b7280',
    },
]

export function PearlsPickerModal({ baseName, sizeLabel, basePrice, emoji, onSelect, onClose }: PearlsPickerModalProps) {
    return (
        <AnimatePresence>
            <motion.div
                key="pearls-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 1100,
                    background: 'rgba(10, 10, 20, 0.65)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                <motion.div
                    key="pearls-modal"
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
                    <div style={{ textAlign: 'center', marginBottom: '20px' }}>
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
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e1b4b', letterSpacing: '-0.02em' }}>
                            {baseName}
                        </h2>
                        <span style={{
                            display: 'inline-block', marginTop: '6px',
                            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em',
                            textTransform: 'uppercase', color: '#7c3aed',
                            background: '#ede9fe', padding: '3px 10px', borderRadius: '999px',
                        }}>
                            {sizeLabel} · ₱{basePrice.toFixed(2)}
                        </span>
                        <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: '#6b7280', fontWeight: 600 }}>
                            Choose your pearl option
                        </p>
                    </div>

                    {/* Pearl options */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {PEARL_OPTIONS.map(({ option, addonPrice, icon, desc, color }) => {
                            const finalPrice = basePrice + addonPrice
                            return (
                                <motion.button
                                    key={option}
                                    whileTap={{ scale: 0.97 }}
                                    whileHover={{ scale: 1.01 }}
                                    onClick={() => onSelect(option, finalPrice)}
                                    style={{
                                        display: 'flex', alignItems: 'center',
                                        padding: '14px 18px',
                                        borderRadius: '14px',
                                        border: `2px solid ${color}22`,
                                        background: `${color}08`,
                                        cursor: 'pointer', width: '100%',
                                        gap: '14px', textAlign: 'left',
                                        transition: 'border-color 0.15s, background 0.15s',
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = color
                                        ;(e.currentTarget as HTMLButtonElement).style.background = `${color}14`
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}22`
                                        ;(e.currentTarget as HTMLButtonElement).style.background = `${color}08`
                                    }}
                                >
                                    {/* Icon pill */}
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '12px',
                                        background: `linear-gradient(135deg, ${color}22, ${color}10)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, border: `1px solid ${color}30`,
                                        fontSize: '1.4rem',
                                    }}>
                                        {icon}
                                    </div>

                                    {/* Labels */}
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem', color: '#1e1b4b' }}>
                                            {option}
                                        </p>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>
                                            {desc}
                                        </p>
                                    </div>

                                    {/* Price */}
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        {addonPrice > 0 && (
                                            <p style={{ margin: 0, fontSize: '0.68rem', color: '#0ea5e9', fontWeight: 700, letterSpacing: '0.02em' }}>
                                                +₱{addonPrice}
                                            </p>
                                        )}
                                        <span style={{
                                            fontWeight: 900, fontSize: '1.1rem',
                                            color: color, letterSpacing: '-0.02em',
                                        }}>
                                            ₱{finalPrice.toFixed(2)}
                                        </span>
                                    </div>
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
