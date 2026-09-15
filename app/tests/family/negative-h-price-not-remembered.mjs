// (h) The order page stops remembering the price seen when an item went in the cart → the price-change check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'family',
  name: 'h-price-not-remembered',
  why: 'the cart line no longer keeps the price seen when it was added, so a price change is never mentioned',
  patches: [{ file: 'family/order/order.js', from: ', allergen_ack: ack === true, price_cents: item.price_cents })', to: ', allergen_ack: ack === true })' }],
  spec: 'order.spec.mjs',
  grep: 'a price change after adding: the cart shows the current price, says it changed, and its total equals the placed total',
  expect: ['.price-changed'],
}))
