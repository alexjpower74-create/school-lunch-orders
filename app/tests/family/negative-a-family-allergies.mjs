// (a) The order page uses every child's allergies for the warning → the Ava check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'family',
  name: 'a-family-allergies',
  why: "the order page warns using every child's allergies instead of the selected child's",
  patches: [{ file: 'family/order/order.js', from: 'const cs = state.tools.conflicts(item.allergens, c.allergies)',
    to: 'const cs = state.tools.conflicts(item.allergens, state.family.children.flatMap((k) => k.allergies))' }],
  spec: 'order.spec.mjs',
  grep: 'allergen warning for Liam and not for Ava',
  expect: ['data-conflict'],
}))
