// (b) The label's allergen line is dropped → the labels check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(
  pageNegative({
    dir: 'staff',
    name: 'label-allergen',
    why: 'the kitchen label no longer renders the ALLERGY line for a conflict',
    patches: [{ file: 'kitchen/labels/labels.js', from: '  if (l.conflicts.length) {', to: '  if (false) {' }],
    spec: 'kitchen.spec.mjs',
    grep: "one label per active line and Liam's names Milk",
    project: 'chromium-1280',
    expect: ["Liam's label-allergen"],
  }),
)
