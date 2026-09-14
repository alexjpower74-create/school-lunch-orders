// `npm run negative:family`: every page negative control in tests/family (port 8606), each must go red.
import { runAll } from '../negative-lib.mjs'

process.exit(runAll('family'))
