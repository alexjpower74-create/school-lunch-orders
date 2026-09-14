// (d) The office panel keeps the balance from before the payment → the payment check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'staff',
  name: 'office-balance',
  why: "the office family panel ignores the payment answer's balance_cents and keeps the old balance",
  patches: [{
    file: 'office/office.js',
    from: '      detail.balance_cents = res.balance_cents\n      detail.entries = [res.entry, ...detail.entries]\n      renderPanel()\n      const done',
    to: '      detail.entries = [res.entry, ...detail.entries]\n      renderPanel()\n      const done',
  }],
  spec: 'office.spec.mjs',
  grep: 'record a payment by typing, then undo it',
  project: 'chromium-1280',
  expect: ['#family-balance after the payment'],
}))
