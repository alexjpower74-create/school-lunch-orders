// (b) The red warning element is not rendered → the Liam check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'family',
  name: 'b-no-warning',
  why: 'the order page does not render the red .allergen-warning',
  patches: [{ file: 'family/order/order.js',
    from: "    cs.length ? h('p', { class: 'allergen-warning' }, icon('alert'), h('span', {}, warningText(c.first_name, words, item.name))) : null,\n",
    to: '    null,\n' }],
  spec: 'order.spec.mjs',
  grep: 'allergen warning for Liam and not for Ava',
  expect: ['.allergen-warning'],
}))
