// (m) The label fit logic is switched off (the wording stays as it is): a crowded label keeps its full "Also: …" line and its
// words are cut off at 1 inch → the at-print no-cut-off check goes red on the worst-case child.
import { pageNegative } from '../negative-lib.mjs'

process.exit(
  pageNegative({
    dir: 'staff',
    name: 'label-no-fit',
    why: 'labels.js fit() does nothing, so a label too full for 1 inch is printed with its words cut off',
    patches: [{ file: 'kitchen/labels/labels.js', from: 'function fit(el) {\n', to: 'function fit(el) {\n  return true\n' }],
    spec: 'kitchen.spec.mjs',
    grep: 'at print no label cuts off its words, even for a child with every allergy',
    project: 'chromium-1280',
    expect: ['labels whose words are cut off at print'],
  }),
)
