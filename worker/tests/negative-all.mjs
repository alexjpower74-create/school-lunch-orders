// biome-ignore-all lint/suspicious/noTemplateCurlyInString: these strings are source code the negative control patches in, not templates
// `npm run negative`: the 13 Worker negative controls from PLAN.md, plus 14 (the late allergy acknowledgement). Each breaks one
// rule in a COPY of worker/ (worker/.negative), runs only the tests that guard it on port 8605 (NEG_PORT), and must go red for exactly the named tests. Results are appended to
// tests/negative-control.log. Exit 0 only when every control went red.
//   node tests/negative-all.mjs            all of them
//   node tests/negative-all.mjs 3 11       only controls 3 and 11
import { negative } from './negative-lib.mjs'

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const only = (names) => ['--grep', names.map((n) => `^${esc(n)}$`).join('|')]

const T = {
  unitDayBefore: 'cut-off: the school day before, not the day itself (Wed Sep 16 closes 9:00 AM Tue Sep 15)',
  apiClock:
    'cut-off on a fake clock: Wed Sep 16 at 8:59 AM → 201, at 9:00 AM → 409 cutoff_passed, at the anchor → 409; Thu Sep 17 at the anchor → 201',
  unitHoliday: 'cut-off: holiday and PD day are skipped (Tue Oct 13 → Fri Oct 9, Mon Oct 26 → Thu Oct 22)',
  apiOct13: 'cut-off: Tue Oct 13 open until 9:00 AM Fri Oct 9 and closed one minute after',
  liamNoAck: 'allergens: Liam + mac without allergen_ack → 409 allergen_ack_required listing that index',
  avaNoAck: 'allergens: Ava (no allergies) + mac on Thu Sep 17 without an ack → 201',
  storm:
    'storm closure to the cent: seeded random orders, a price change and a cancelled line; preview = cancelled, credit = active totals, each balance drops by its own sum',
  kitchen: 'kitchen totals = sum of orders: random orders over two days plus cancellations and a closure',
  isolation: "family isolation: fam-2's token on fam-1's child, line and cancel → 404, and nothing changes",
  roles: 'role matrix: every role × one route per area → 200 / 403 / 401',
  unitCsv: 'CSV: quoting and the formula guard',
  apiCsv: 'office CSV: ledger and balances, header, -3.00 and the formula guard on a family label =SUM(A1)',
  rate: 'family sign-in rate limit: 10 wrong codes from one IP, then 429 even for the right code',
  snapshot: 'price snapshot: a later price change never changes a placed line',
  lateAck:
    'allergy ticked after ordering: the family line and the kitchen show it unconfirmed; "I understand, keep it" confirms it for both',
}

const CONTROLS = [
  {
    name: '01-cutoff-own-day',
    why: "cut-off compares against D's own 9:00 AM instead of the school day before",
    patches: [
      {
        file: 'src/calendar.js',
        from: '  for (let i = 0; i < cal.school.cutoff_days_before; i++) {',
        to: '  for (let i = 0; i < 0; i++) {',
      },
    ],
    args: only([T.unitDayBefore, T.apiClock]),
    expectRed: [T.unitDayBefore, T.apiClock],
  },
  {
    name: '02-cutoff-no-holiday-skip',
    why: 'cut-off stops skipping holidays and PD days',
    patches: [{ file: 'src/calendar.js', from: '    while (!isWeekday(p) || isPlannedDayOff(cal, p))', to: '    while (!isWeekday(p))' }],
    args: only([T.unitHoliday, T.apiOct13]),
    expectRed: [T.unitHoliday, T.apiOct13],
  },
  {
    name: '03-no-ack-required',
    why: 'the server stops requiring allergen_ack',
    patches: [{ file: 'src/orders.js', from: '    if (cs.length && l.allergen_ack !== true) {', to: '    if (false) {' }],
    args: ['--api-only', ...only([T.liamNoAck])],
    expectRed: [T.liamNoAck],
  },
  {
    name: '04-family-allergies',
    why: "conflicts use the whole family's allergies (a sibling's allergy blocks Ava)",
    patches: [
      {
        file: 'src/orders.js',
        from: '    const cs = conflicts(item.allergens, child.allergies)',
        to: '    const cs = conflicts(item.allergens, [...children.values()].flatMap((k) => k.allergies))',
      },
    ],
    args: ['--api-only', ...only([T.avaNoAck])],
    expectRed: [T.avaNoAck],
  },
  {
    name: '05-closure-ignores-qty',
    why: 'closure credit ignores qty (credits the unit price once per line)',
    patches: [{ file: 'src/admin.js', from: "'closure', -SUM(total_cents), ?", to: "'closure', -SUM(unit_price_cents), ?" }],
    args: ['--api-only', ...only([T.storm])],
    expectRed: [T.storm],
  },
  {
    name: '06-closure-credits-cancelled',
    why: 'closure also credits lines that were already cancelled',
    patches: [
      {
        file: 'src/admin.js',
        from: "WHERE date = ? AND status = 'active' GROUP BY family_id",
        to: "WHERE date = ? AND status IN ('active', 'cancelled') GROUP BY family_id",
      },
    ],
    args: ['--api-only', ...only([T.storm])],
    expectRed: [T.storm],
  },
  {
    name: '07-kitchen-counts-lines',
    why: 'kitchen totals count lines instead of qty',
    patches: [{ file: 'src/kitchen.js', from: '    item_count += r.qty', to: '    item_count += 1' }],
    args: ['--api-only', ...only([T.kitchen])],
    expectRed: [T.kitchen],
  },
  {
    name: '08-kitchen-includes-cancelled',
    why: 'kitchen includes cancelled (and closed) lines',
    patches: [
      {
        file: 'src/kitchen.js',
        from: "WHERE l.date = ? AND l.status = 'active'`)",
        to: 'WHERE l.date = ?`)',
      },
    ],
    args: ['--api-only', ...only([T.kitchen])],
    expectRed: [T.kitchen],
  },
  {
    name: '09-cancel-no-family-check',
    why: 'cancel skips the family check',
    patches: [
      {
        file: 'src/orders.js',
        from: 'WHERE l.id = ? AND l.family_id = ?`).bind(id, c.family.id).first()',
        to: 'WHERE l.id = ?`).bind(id).first()',
      },
    ],
    args: ['--api-only', ...only([T.isolation])],
    expectRed: [T.isolation],
  },
  {
    name: '10-kitchen-into-office',
    why: 'the role matrix lets kitchen into office',
    patches: [{ file: 'src/auth.js', from: "  office: ['admin'],", to: "  office: ['admin', 'kitchen']," }],
    args: ['--api-only', ...only([T.roles])],
    expectRed: [T.roles],
  },
  {
    name: '11-no-formula-guard',
    why: 'the CSV formula guard is removed',
    patches: [{ file: 'src/csv.js', from: "  if (/^[=+\\-@\\t\\r]/.test(s)) s = `'${s}`\n", to: '' }],
    args: only([T.unitCsv, T.apiCsv]),
    expectRed: [T.unitCsv, T.apiCsv],
  },
  {
    name: '12-no-code-rate-guard',
    why: 'the family-code rate guard is off',
    patches: [{ file: 'src/auth.js', from: '  await assertCodeAllowed(c)\n', to: '' }],
    args: ['--api-only', ...only([T.rate])],
    expectRed: [T.rate],
  },
  {
    name: '13-current-price',
    why: "a line takes the item's current price instead of its snapshot",
    patches: [
      {
        file: 'src/lines.js',
        from: 'l.qty, l.unit_price_cents, l.total_cents,',
        to: 'l.qty, i.price_cents AS unit_price_cents, l.qty * i.price_cents AS total_cents,',
      },
    ],
    args: ['--api-only', ...only([T.snapshot, T.storm])],
    expectRed: [T.snapshot, T.storm],
  },
  {
    name: '14-ack-writes-nothing',
    why: 'confirming an allergy ticked after ordering stores [] instead of the current conflicts',
    patches: [
      { file: 'src/orders.js', from: '.bind(JSON.stringify(line.conflicts), c.nowIso, id)', to: '.bind(JSON.stringify([]), c.nowIso, id)' },
    ],
    args: ['--api-only', ...only([T.lateAck])],
    expectRed: [T.lateAck],
  },
]

const pick = process.argv.slice(2).map(Number)
const chosen = pick.length ? CONTROLS.filter((_, i) => pick.includes(i + 1)) : CONTROLS
const results = []
for (const c of chosen) {
  console.log(`\n--- negative ${c.name}: ${c.why}`)
  results.push([c.name, await negative(c)])
}
console.log('\nWorker negative controls:')
for (const [name, code] of results)
  console.log(`  ${code === 0 ? 'RED as intended' : code === 2 ? 'BREAK DID NOT APPLY' : 'STAYED GREEN'}  ${name}`)
const bad = results.filter(([, code]) => code !== 0).length
console.log(bad ? `${bad} of ${results.length} did not go red` : `${results.length} of ${results.length} went red`)
process.exit(bad ? 1 : 0)
