// (c) button.ack adds the item without recording the acknowledgement → the ack_allergens check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'family',
  name: 'c-ack-not-recorded',
  why: '"I understand, add it" adds 1 but does not record allergen_ack',
  patches: [{ file: 'family/order/order.js', from: "onclick: () => change(c, d, item, inCart ? 0 : 1, true) }, 'I understand, add it')",
    to: "onclick: () => change(c, d, item, inCart ? 0 : 1, false) }, 'I understand, add it')" }],
  spec: 'order.spec.mjs',
  grep: '"I understand" is required: the tap adds 1, the cart keeps the tick, unticking disables Place order, and the order stores ack_allergens',
}))
