// (e) A transparent cover over the cart bar's neighbour (the last item on the page) → the tap-target check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'family',
  name: 'e-cover',
  why: 'a transparent box rises 180 px above #cart-bar, over the last item\'s stepper',
  patches: [{ file: 'family/family.css', from: '#cart-bar .inner {',
    to: "#cart-bar::before { content: ''; position: absolute; left: 0; right: 0; bottom: 100%; height: 180px; }\n#cart-bar .inner {" }],
  spec: 'layout.spec.mjs',
  grep: "order page: tap targets, and the last item's stepper is not covered by #cart-bar at the bottom of the page",
  expect: ['something is on top'],
}))
