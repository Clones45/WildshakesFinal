import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface DeliveryPlatformModalProps {
    isOpen: boolean
    onSelect: (platform: 'foodpanda' | 'grab') => void
    onClose: () => void
}

export function DeliveryPlatformModal({ isOpen, onSelect, onClose }: DeliveryPlatformModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.88, y: 28 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.88, y: 28 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                        className="bg-surface-800 border border-surface-600 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="relative px-6 pt-6 pb-4 text-center border-b border-surface-600">
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-surface-700 flex items-center justify-center text-gray-400 hover:bg-surface-600 transition-colors"
                            >
                                <X size={14} />
                            </button>
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Delivery Order</p>
                            <h2 className="text-xl font-extrabold text-white">Which platform?</h2>
                            <p className="text-gray-500 text-sm mt-1">Select the delivery app for this order</p>
                        </div>

                        {/* Platform buttons */}
                        <div className="p-6 grid grid-cols-2 gap-4">
                            {/* FoodPanda */}
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => onSelect('foodpanda')}
                                className="relative flex flex-col items-center justify-center gap-3 py-8 px-4 rounded-2xl border-2 transition-all"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(232,0,94,0.15), rgba(232,0,94,0.08))',
                                    borderColor: 'rgba(232,0,94,0.5)',
                                }}
                            >
                                {/* FoodPanda panda emoji + brand colors */}
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-lg"
                                    style={{ background: 'rgba(232,0,94,0.2)', border: '1px solid rgba(232,0,94,0.4)' }}
                                >
                                    🐼
                                </div>
                                <div className="text-center">
                                    <p className="font-extrabold text-lg leading-tight" style={{ color: '#e8005e' }}>
                                        FoodPanda
                                    </p>
                                    <p className="text-gray-500 text-xs mt-0.5">Pink Platform</p>
                                </div>
                                {/* Glow effect */}
                                <div
                                    className="absolute inset-0 rounded-2xl opacity-0 hover:opacity-100 transition-opacity"
                                    style={{ boxShadow: '0 0 30px rgba(232,0,94,0.25)' }}
                                />
                            </motion.button>

                            {/* Grab */}
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => onSelect('grab')}
                                className="relative flex flex-col items-center justify-center gap-3 py-8 px-4 rounded-2xl border-2 transition-all"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(0,177,79,0.15), rgba(0,177,79,0.08))',
                                    borderColor: 'rgba(0,177,79,0.5)',
                                }}
                            >
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-lg"
                                    style={{ background: 'rgba(0,177,79,0.2)', border: '1px solid rgba(0,177,79,0.4)' }}
                                >
                                    🟢
                                </div>
                                <div className="text-center">
                                    <p className="font-extrabold text-lg leading-tight" style={{ color: '#00b14f' }}>
                                        Grab
                                    </p>
                                    <p className="text-gray-500 text-xs mt-0.5">Green Platform</p>
                                </div>
                                {/* Glow effect */}
                                <div
                                    className="absolute inset-0 rounded-2xl opacity-0 hover:opacity-100 transition-opacity"
                                    style={{ boxShadow: '0 0 30px rgba(0,177,79,0.25)' }}
                                />
                            </motion.button>
                        </div>

                        <div className="px-6 pb-6">
                            <button
                                onClick={onClose}
                                className="w-full py-2.5 rounded-xl bg-surface-700 border border-surface-500 text-gray-400 text-sm font-semibold hover:bg-surface-600 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
