// (e) The closure confirm shows the kitchen's line count instead of the preview → the confirm-numbers check goes red.
// Thursday's orders have 11 lines but 13 items (Ava's apples ×2, Jack's milk ×2), so the two numbers differ.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'staff',
  name: 'closure-confirm',
  why: "the no-school confirm counts the kitchen's order lines instead of the preview's item_count",
  patches: [{
    file: 'admin/admin.js',
    from: "      preview = await staffApi('GET', `/api/admin/no-school/preview?date=${encodeURIComponent(date)}`)",
    to: "      const k = await staffApi('GET', `/api/kitchen/day?date=${encodeURIComponent(date)}`)\n" +
      "      preview = { ...(await staffApi('GET', `/api/admin/no-school/preview?date=${encodeURIComponent(date)}`)), item_count: k.totals.line_count }",
  }],
  spec: 'admin.spec.mjs',
  grep: 'storm closure: confirm numbers equal the preview, credits to the cent',
  project: 'chromium-1280',
  expect: ['confirm-items = preview item_count'],
}))
