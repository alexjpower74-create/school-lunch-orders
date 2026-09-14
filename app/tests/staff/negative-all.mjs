// Runs every staff negative control (a–f) against broken copies on port 8607; exit 0 only if each went red.
import { runAll } from '../negative-lib.mjs'

process.exit(runAll('staff'))
