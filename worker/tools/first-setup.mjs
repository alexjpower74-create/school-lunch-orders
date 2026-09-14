// First setup for a real school (no TEST_MODE, nothing seeded): writes SQL for the school row and the one office (admin) PIN.
// Nothing else: classes, items and families are added in /admin/ and /office/. The PIN is hashed here with the same PBKDF2
// parameters as src/auth.js and is never printed.
//   node tools/first-setup.mjs --school "<name>" --admin "<name>" --pin <4-6 digits> [--payment "<text>"]
//     [--year-start YYYY-MM-DD --year-end YYYY-MM-DD] --out <file.sql>
// Then (Alexander, never an agent): wrangler d1 execute school-lunch-orders --remote --file <file.sql>
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { PBKDF2_ITERATIONS } from '../src/auth.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (d) => DATE_RE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const sql = (s) => (s === null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)

async function hashPin(pin, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const salt = new Uint8Array(saltHex.match(/../g).map((x) => parseInt(x, 16)))
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256))
}

/** Checks the options and returns the SQL; throws an Error with a plain message when something is wrong. */
export async function buildSetupSql(o) {
  const school = (o.school || '').trim()
  const admin = (o.admin || '').trim()
  if (!school || school.length > 80) throw new Error('--school: the school name, 1 to 80 characters.')
  if (!admin || admin.length > 60) throw new Error('--admin: the office person\'s name, 1 to 60 characters.')
  if (!/^\d{4,6}$/.test(o.pin || '')) throw new Error('--pin: 4 to 6 digits.')
  const payment = (o.payment || 'Ask the office how to pay.').trim()
  if (payment.length > 600) throw new Error('--payment: up to 600 characters.')
  const start = o.yearStart ?? null
  const end = o.yearEnd ?? null
  if ((start === null) !== (end === null)) throw new Error('--year-start and --year-end go together.')
  if (start !== null && (!validDate(start) || !validDate(end) || end <= start)) throw new Error('--year-start and --year-end: dates, start before end.')
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  const hash = await hashPin(o.pin, salt)
  const id = `st_${hex(crypto.getRandomValues(new Uint8Array(8)))}`
  return [
    '-- School Lunch Orders first setup: the school row and one office PIN. Apply once to an empty, migrated D1.',
    `INSERT INTO school (id, school_name, sample, payment_instructions, cutoff_days_before, cutoff_time, year_start, year_end) VALUES (1, ${sql(school)}, 0, ${sql(payment)}, 1, '09:00', ${sql(start)}, ${sql(end)});`,
    `INSERT INTO staff (id, name, role, pin_hash, pin_salt, class_id, active) VALUES (${sql(id)}, ${sql(admin)}, 'admin', ${sql(hash)}, ${sql(salt)}, NULL, 1);`,
    '',
  ].join('\n')
}

function parseArgs(argv) {
  const names = { '--school': 'school', '--admin': 'admin', '--pin': 'pin', '--payment': 'payment', '--year-start': 'yearStart', '--year-end': 'yearEnd', '--out': 'out' }
  const o = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!names[argv[i]] || argv[i + 1] === undefined) throw new Error(`Unknown or empty option ${argv[i]}.`)
    o[names[argv[i]]] = argv[i + 1]
  }
  if (!o.out) throw new Error('--out: the SQL file to write.')
  return o
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const o = parseArgs(process.argv.slice(2))
    writeFileSync(o.out, await buildSetupSql(o))
    console.log(`Wrote ${o.out}: the school "${o.school.trim()}" and one office PIN for ${o.admin.trim()} (the PIN is not shown).`)
  } catch (e) {
    console.error(`first-setup: ${e.message}`)
    process.exit(1)
  }
}
