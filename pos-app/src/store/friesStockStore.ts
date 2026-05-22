import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FriesFlavor } from '../components/FlavorPickerModal'

interface FriesStockState {
    outOfStockFlavors: FriesFlavor[]
    toggleFlavorStock: (flavor: FriesFlavor) => void
    isFlavorAvailable: (flavor: FriesFlavor) => boolean
}

export const useFriesStockStore = create<FriesStockState>()(
    persist(
        (set, get) => ({
            outOfStockFlavors: [],
            toggleFlavorStock: (flavor) => {
                set((state) => {
                    const isOut = state.outOfStockFlavors.includes(flavor)
                    if (isOut) {
                        return { outOfStockFlavors: state.outOfStockFlavors.filter(f => f !== flavor) }
                    } else {
                        return { outOfStockFlavors: [...state.outOfStockFlavors, flavor] }
                    }
                })
            },
            isFlavorAvailable: (flavor) => {
                return !get().outOfStockFlavors.includes(flavor)
            }
        }),
        {
            name: 'wildshakes-fries-stock',
        }
    )
)
