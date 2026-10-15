// Run with: npx tsx tests/pricing.test.ts
// Pure checks of the till's pricing rules: every platform, every blank, zero and
// string-from-the-database case, and branch-only prices laid over the menu's.
import assert from 'node:assert/strict'
import { applyBranchPrices, deliveryPriceFor, priceFor, toNum } from '../src/lib/pricing'

const item = { price: 150, foodpanda_price: 165, grab_price: 170 }
const noGrab = { price: 150, foodpanda_price: 165, grab_price: null }
const freeBox = { price: 15, foodpanda_price: 0, grab_price: 0 }
const fromDb = { price: '150.00', foodpanda_price: '165', grab_price: '170.50' }

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name) }

t('no platform: the normal price', () => {
    assert.equal(priceFor(item, null), 150)
    assert.equal(priceFor(item, undefined), 150)
    assert.equal(deliveryPriceFor(item, null), null)
})
t('each platform has its own price', () => {
    assert.equal(priceFor(item, 'foodpanda'), 165)
    assert.equal(priceFor(item, 'grab'), 170)
})
t('not offered on a platform: back to the normal price', () => {
    assert.equal(deliveryPriceFor(noGrab, 'grab'), null)
    assert.equal(priceFor(noGrab, 'grab'), 150)
    assert.equal(priceFor(noGrab, 'foodpanda'), 165)
})
t('zero is a real price (free packaging), not "no price"', () => {
    assert.equal(deliveryPriceFor(freeBox, 'foodpanda'), 0)
    assert.equal(priceFor(freeBox, 'grab'), 0)
    assert.equal(priceFor(freeBox, null), 15)
})
t('numbers that arrive as strings become numbers', () => {
    assert.equal(priceFor(fromDb, null), 150)
    assert.equal(priceFor(fromDb, 'grab'), 170.5)
    assert.equal(toNum(''), null)
    assert.equal(toNum('0'), 0)
})
t('a branch with no own prices follows the menu', () => {
    assert.deepEqual(applyBranchPrices(item, undefined), item)
    assert.deepEqual(applyBranchPrices(item, { price: null, foodpanda_price: null, grab_price: null }), item)
})
t('a branch-only figure replaces only its own column', () => {
    const r = applyBranchPrices(item, { price: null, foodpanda_price: null, grab_price: 180 })
    assert.deepEqual(r, { price: 150, foodpanda_price: 165, grab_price: 180 })
    const r2 = applyBranchPrices(item, { price: 160, foodpanda_price: null, grab_price: null })
    assert.deepEqual(r2, { price: 160, foodpanda_price: 165, grab_price: 170 })
})
t('a branch can make an item free on one app only', () => {
    const r = applyBranchPrices(item, { price: null, foodpanda_price: 0, grab_price: null })
    assert.equal(priceFor(r, 'foodpanda'), 0)
    assert.equal(priceFor(r, 'grab'), 170)
})
t('a branch cannot "un-offer" an item: a blank means follow the menu', () => {
    const r = applyBranchPrices(noGrab, { price: null, foodpanda_price: null, grab_price: null })
    assert.equal(priceFor(r, 'grab'), 150)
})
t('branch figures that arrive as strings become numbers', () => {
    const r = applyBranchPrices(fromDb, { price: '160', foodpanda_price: '0', grab_price: null })
    assert.deepEqual({ price: r.price, foodpanda_price: r.foodpanda_price, grab_price: r.grab_price }, { price: 160, foodpanda_price: 0, grab_price: 170.5 })
})
t('other fields on the row survive untouched', () => {
    const r = applyBranchPrices({ ...item, id: 'x', name: 'Mango', stock_qty: 3 }, { price: 155, foodpanda_price: null, grab_price: null })
    assert.equal(r.id, 'x'); assert.equal(r.name, 'Mango'); assert.equal(r.stock_qty, 3); assert.equal(r.price, 155)
})

console.log(`\n${n} pricing checks passed`)
