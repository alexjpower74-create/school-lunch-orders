// (g) The items form sends the price in dollars instead of cents (3.75, not 375) → the new-item round-trip goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'staff',
  name: 'item-price',
  why: 'the items form sends price_cents as dollars (the typed 3.75 divided by 100 again is never cents)',
  patches: [{ file: 'admin/admin.js', from: '    price_cents: price,\n', to: '    price_cents: price / 100,\n' }],
  spec: 'settings.spec.mjs',
  grep: 'a new item saves with price in dollars, allergens, days and max',
  project: 'chromium-1280',
  expect: ['item-saved'],
}))
