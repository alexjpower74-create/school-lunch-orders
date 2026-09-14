// Every journey negative control in turn (npm run negative:journey). Exits 0 only if each went red as intended.
import { runAll } from '../negative-lib.mjs'

process.exit(runAll('journey'))
