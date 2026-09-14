// (g) The items form stores a wrong price the Worker accepts: the typed dollars are turned into a whole number that is not the
// cents (3.75 → 38). The save succeeds, so the red must come from the price check: the new item's row shows $0.38, not $3.75.
// (An earlier version sent 3.75 / 100, which the Worker refused with a 400; that red only proved a refused save shows no
// "Saved", so it was replaced. Both runs are in negative-control.log.)
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'staff',
  name: 'item-price',
  why: 'the items form sends Math.round(price / 10) as price_cents, a valid number the Worker stores (3.75 typed → 38 cents)',
  patches: [{ file: 'admin/admin.js', from: '    price_cents: price,\n', to: '    price_cents: Math.round(price / 10),\n' }],
  spec: 'settings.spec.mjs',
  grep: 'a new item saves with price in dollars, allergens, days and max',
  project: 'chromium-1280',
  expect: ['the new item row price', 'Pea soup (SAMPLE) · $0.38'],
}))
