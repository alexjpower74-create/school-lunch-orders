// (i) The office's Add adjustment loses its busy guard: a double tap sends two requests → the double-tap check goes red on the
// stored count.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'staff',
  name: 'adjust-double',
  why: 'Add adjustment is not disabled while its request runs, so a second tap records a second adjustment',
  patches: [{ file: 'office/office.js', from: "  await busy($('#record-adjustment'), async () => {", to: '  await busy(null, async () => {' }],
  spec: 'office.spec.mjs',
  grep: 'a double tap on Add adjustment records one adjustment',
  project: 'chromium-1280',
  expect: ['adjustments stored after a double tap'],
}))
