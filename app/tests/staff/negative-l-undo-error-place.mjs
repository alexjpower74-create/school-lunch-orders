// (l) A refused Undo shows its words in the payment form again, away from the entry that was tapped → the "next to that entry"
// check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'staff',
  name: 'undo-error-place',
  why: "a refused Undo puts its words in #payment-error instead of under the entry",
  patches: [{ file: 'office/office.js', from: '      fail(errorEl, err) // next to the entry that was tapped\n', to: "      fail($('#payment-error'), err)\n" }],
  spec: 'office.spec.mjs',
  grep: 'a refused undo shows its words next to that entry',
  project: 'chromium-1280',
  expect: ['the refusal next to the entry that was tapped'],
}))
