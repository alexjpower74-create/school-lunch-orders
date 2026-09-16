// (g) Home ignores `acknowledged`: an allergy ticked after ordering shows no warning → the late-allergy check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(
  pageNegative({
    dir: 'family',
    name: 'g-home-ignores-ack',
    why: 'the family home never shows the red warning for an allergy ticked after ordering',
    patches: [{ file: 'family/home.js', from: '  const needsAck = !line.acknowledged\n', to: '  const needsAck = false\n' }],
    spec: 'home.spec.mjs',
    grep: 'an allergy ticked after ordering: home shows the red warning and "I understand, keep it" confirms it; the kitchen agrees',
    expect: ['.allergen-warning'],
  }),
)
