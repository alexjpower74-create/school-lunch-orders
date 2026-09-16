// (d) The cart ignores an API refusal and shows "Order placed" → the cut-off check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(
  pageNegative({
    dir: 'family',
    name: 'd-ignore-refusal',
    why: 'the cart page treats a refusal as success: empties the cart and shows "Order placed"',
    patches: [
      {
        file: 'family/cart/cart.js',
        from: '    showRefusal(e)\n',
        to: '    state.cart = []\n    save()\n    showPlaced({ order: { total_cents: 0 }, balance_cents: 0 })\n',
      },
    ],
    spec: 'order.spec.mjs',
    grep: 'a closed day has no steppers; placing after the cut-off shows #order-error naming the day, marks the line and stores nothing',
    expect: ['#order-error'],
  }),
)
