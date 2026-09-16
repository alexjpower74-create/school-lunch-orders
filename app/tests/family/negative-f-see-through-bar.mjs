// (f) The cart bar's background is transparent again, so card text reads through it → the order-page layout check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(
  pageNegative({
    dir: 'family',
    name: 'f-see-through-bar',
    why: '#cart-bar gets a transparent background (no blur), so the cards behind it show through',
    patches: [
      {
        file: 'family/family.css',
        from: '  background: var(--surface); /* solid: no card text reads through the bar */',
        to: '  background: transparent;',
      },
    ],
    spec: 'layout.spec.mjs',
    grep: "order page: tap targets, and the last item's stepper is not covered by #cart-bar at the bottom of the page",
    expect: ['cart bar background is solid'],
  }),
)
