// Journey negative control: the Worker copy credits a storm closure by unit price, ignoring qty. Jack's White milk ×2 is then
// credited $1.00 instead of $2.00, so the journey's "each family credited exactly its own Thursday total" check must go red.
// Run: node tests/journey/negative-closure-credit.mjs (copies on 8608, or NEG_PORT)
import { pageNegative } from '../negative-lib.mjs'

process.exit(
  pageNegative({
    dir: 'journey',
    name: 'closure-credit',
    why: "the Worker copy credits a closure by unit price and ignores qty (Jack's milk ×2 credited as one)",
    patches: [{ file: 'worker/src/admin.js', from: "'closure', -SUM(total_cents), ?", to: "'closure', -SUM(unit_price_cents), ?" }],
    spec: 'journey.spec.mjs',
    grep: 'a parent orders, the kitchen sees it, a storm closure credits it to the cent, the teacher and kitchen see no school',
    project: 'chromium-1280',
    // The copy's POST answer is read back from what it wrote, so the result line already shows the wrong credit ($19.00: Jack's
    // milk ×2 credited once) and the journey stops there, before the per-family balance check.
    expect: ['Credited $19.00'],
  }),
)
