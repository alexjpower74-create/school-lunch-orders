// (k) The label's ALLERGY line goes back to listing all of the child's allergies instead of only the conflict → the
// "names only its allergen" check goes red on Chloe's cookie label.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'staff',
  name: 'label-all-allergies',
  why: "the label's ALLERGY part lists every allergy the child has, not just the ones in this lunch",
  patches: [{
    file: 'kitchen/labels/labels.js',
    from: "h('div', { class: 'label-allergen' }, `ALLERGY: ${words(l.conflicts)}`,",
    to: "h('div', { class: 'label-allergen' }, `ALLERGY: ${words(l.allergies)}`,",
  }],
  spec: 'kitchen.spec.mjs',
  grep: 'a conflict names only its allergen, and the other allergies follow as "Also allergic to"',
  project: 'chromium-1280',
  expect: ["Chloe's label-allergen names only the conflict"],
}))
