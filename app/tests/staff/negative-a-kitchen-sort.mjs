// (a) The kitchen page sorts children by name only → the flagged-rows-first check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(
  pageNegative({
    dir: 'staff',
    name: 'kitchen-sort',
    why: 'the kitchen page sorts children by first name only, ignoring the allergy flag',
    patches: [
      {
        file: 'kitchen/kitchen.js',
        from: '.sort((a, b) => rank(a) - rank(b))',
        to: '.sort((a, b) => a.first_name.localeCompare(b.first_name))',
      },
    ],
    spec: 'kitchen.spec.mjs',
    grep: 'allergy rows come first with the red edge',
    project: 'chromium-1280',
    expect: ['children order'],
  }),
)
