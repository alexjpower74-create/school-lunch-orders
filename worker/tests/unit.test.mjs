// Pure rules: the calendar and cut-off (every worked example in docs/API.md), day status, week labels, allergen conflicts,
// balance phrase inputs, CSV quoting and the formula guard, family code normalisation.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { balancePhrase } from '../../app/public/common/ui.js'
import { acknowledged, allergenWords, cleanAllergenList, conflicts, flagOf } from '../src/allergens.js'
import {
  cutoffAt,
  cutoffDate,
  cutoffLabel,
  cutoffRuleLabel,
  dayStatus,
  isSchoolDay,
  makeCal,
  nextSchoolDay,
  staffStatus,
  weekLabel,
  weekStart,
} from '../src/calendar.js'
import { CODE_ALPHABET, formatCode, newCode, normalizeCode } from '../src/codes.js'
import { amountCell, csvText, textCell } from '../src/csv.js'
import { orderLabel, sumBalance } from '../src/ledger.js'
import { NO_SCHOOL, SAMPLE_SCHOOL, menuEnd } from '../src/seed.js'

const NOW = new Date('2026-09-15T13:30:00Z')
const cal = makeCal(SAMPLE_SCHOOL, NO_SCHOOL)
const at = (d, c = cal) => cutoffAt(c, d).toISOString()
const status = (d, now = NOW, c = cal, hasMenu = true) => dayStatus(c, d, { hasMenu, at: cutoffAt(c, d), now }).status

test('cut-off: the school day before, not the day itself (Wed Sep 16 closes 9:00 AM Tue Sep 15)', () => {
  assert.equal(at('2026-09-16'), '2026-09-15T11:30:00.000Z')
  assert.equal(cutoffLabel(cal, '2026-09-16', cutoffAt(cal, '2026-09-16'), NOW), 'Ordering closed at 9:00 AM Tue Sep 15')
  assert.equal(status('2026-09-16'), 'closed')
  assert.equal(at('2026-09-17'), '2026-09-16T11:30:00.000Z')
  assert.equal(cutoffLabel(cal, '2026-09-17', cutoffAt(cal, '2026-09-17'), NOW), 'Order by 9:00 AM Wed Sep 16')
  assert.equal(status('2026-09-17'), 'open')
  assert.equal(cutoffDate(cal, '2026-09-21'), '2026-09-18', 'Monday closes on the Friday before (weekends skipped)')
  assert.equal(cutoffLabel(cal, '2026-09-21', cutoffAt(cal, '2026-09-21'), NOW), 'Order by 9:00 AM Fri Sep 18')
  assert.equal(status('2026-09-21'), 'open')
})

test('cut-off: holiday and PD day are skipped (Tue Oct 13 → Fri Oct 9, Mon Oct 26 → Thu Oct 22)', () => {
  assert.equal(status('2026-10-12'), 'no_school')
  assert.equal(dayStatus(cal, '2026-10-12', { hasMenu: true, at: cutoffAt(cal, '2026-10-12'), now: NOW }).status_label, 'Holiday')
  assert.equal(cutoffLabel(cal, '2026-10-12', cutoffAt(cal, '2026-10-12'), NOW), null)
  assert.equal(cutoffDate(cal, '2026-10-13'), '2026-10-09')
  assert.equal(at('2026-10-13'), '2026-10-09T11:30:00.000Z')
  assert.equal(cutoffLabel(cal, '2026-10-13', cutoffAt(cal, '2026-10-13'), NOW), 'Order by 9:00 AM Fri Oct 9')
  assert.equal(cutoffDate(cal, '2026-10-26'), '2026-10-22')
  assert.equal(status('2026-10-26'), 'open')
})

test('cut-off: a closure does not move it; 0 days before is the day itself; the exact instant is closed', () => {
  const withClosure = makeCal(SAMPLE_SCHOOL, [...NO_SCHOOL, { date: '2026-09-23', kind: 'closure', note: '' }])
  assert.equal(cutoffDate(withClosure, '2026-09-24'), '2026-09-23', 'still Wed Sep 23')
  assert.equal(at('2026-09-24', withClosure), '2026-09-23T11:30:00.000Z')
  assert.equal(status('2026-09-24', NOW, withClosure), 'open')
  assert.equal(isSchoolDay(withClosure, '2026-09-23'), false)

  const zero = makeCal({ ...SAMPLE_SCHOOL, cutoff_days_before: 0 }, NO_SCHOOL)
  assert.equal(at('2026-09-17', zero), '2026-09-17T11:30:00.000Z')
  const two = makeCal({ ...SAMPLE_SCHOOL, cutoff_days_before: 2 }, NO_SCHOOL)
  assert.equal(
    cutoffDate(two, '2026-10-14'),
    '2026-10-09',
    'Wed Oct 14: two school days before is Tue Oct 13, then Fri Oct 9 (Mon Oct 12 is a holiday)',
  )

  const exact = new Date('2026-09-15T11:30:00Z')
  assert.equal(status('2026-09-16', exact), 'closed', 'at exactly cutoff_at it is closed')
  assert.equal(status('2026-09-16', new Date(exact.getTime() - 1)), 'open', 'one millisecond before, open')
  assert.equal(status('2026-09-16', new Date('2026-09-15T11:29:00Z')), 'open', '8:59 AM')
})

test('cut-off: an afternoon cut-off time and the rule labels', () => {
  const late = makeCal({ ...SAMPLE_SCHOOL, cutoff_time: '14:30' }, NO_SCHOOL)
  assert.equal(at('2026-09-17', late), '2026-09-16T17:00:00.000Z')
  assert.equal(cutoffLabel(late, '2026-09-17', cutoffAt(late, '2026-09-17'), NOW), 'Order by 2:30 PM Wed Sep 16')
  assert.equal(cutoffRuleLabel(0, '09:00'), 'Order by 9:00 AM on the day.')
  assert.equal(cutoffRuleLabel(1, '09:00'), 'Order by 9:00 AM the school day before.')
  assert.equal(cutoffRuleLabel(2, '09:00'), 'Order by 9:00 AM 2 school days before.')
  assert.equal(cutoffRuleLabel(1, '12:00'), 'Order by 12:00 PM the school day before.')
})

test('day status: the first that applies (no_school, no_menu, closed, open) and the staff statuses', () => {
  assert.equal(status('2026-09-19'), 'no_school', 'Saturday')
  assert.equal(dayStatus(cal, '2027-07-05', { hasMenu: true, at: cutoffAt(cal, '2027-07-05'), now: NOW }).status_label, 'No school')
  assert.equal(
    dayStatus(cal, '2026-10-23', { hasMenu: false, at: cutoffAt(cal, '2026-10-23'), now: NOW }).status_label,
    'PD day',
    'no-school beats no menu',
  )
  assert.equal(status('2026-09-17', NOW, cal, false), 'no_menu')
  assert.equal(
    dayStatus(cal, '2026-09-14', { hasMenu: false, at: cutoffAt(cal, '2026-09-14'), now: NOW }).status,
    'no_menu',
    'no menu beats closed',
  )
  assert.equal(status('2026-09-14'), 'closed')
  assert.deepEqual(staffStatus(cal, '2026-09-19'), { status: 'weekend', status_label: 'Weekend' })
  assert.deepEqual(staffStatus(cal, '2026-11-11'), { status: 'no_school', status_label: 'Holiday' })
  assert.deepEqual(staffStatus(cal, '2027-06-28'), { status: 'outside_year', status_label: 'Outside the school year' })
  assert.deepEqual(staffStatus(cal, '2026-09-17'), { status: 'school_day', status_label: 'School day' })
  assert.equal(nextSchoolDay(cal, '2026-09-15'), '2026-09-16')
  assert.equal(nextSchoolDay(cal, '2026-10-09'), '2026-10-13', 'over the weekend and Thanksgiving')
  assert.equal(nextSchoolDay(cal, '2027-06-25'), null)
  assert.equal(nextSchoolDay(makeCal(null), '2026-09-15'), null, 'an empty D1 has no school year')
})

test('week labels and the Monday of a week', () => {
  assert.equal(weekStart('2026-09-17'), '2026-09-14')
  assert.equal(weekStart('2026-09-20'), '2026-09-14', 'Sunday belongs to the week before')
  assert.equal(weekStart('2026-09-21'), '2026-09-21')
  assert.equal(weekLabel('2026-09-21'), 'Sep 21 to 25')
  assert.equal(weekLabel('2026-09-28'), 'Sep 28 to Oct 2')
  assert.equal(weekLabel('2026-12-28'), 'Dec 28 to Jan 1')
  assert.equal(menuEnd('2026-09-15'), '2026-12-18')
  assert.equal(menuEnd('2026-11-20'), '2027-01-15')
  assert.equal(menuEnd('2027-06-01'), '2027-06-25')
})

test("conflicts: only the child's own allergies, in list order", () => {
  const mac = ['wheat_triticale', 'gluten', 'milk']
  assert.deepEqual(conflicts(mac, ['milk']), ['milk'], 'Liam')
  assert.deepEqual(conflicts(mac, []), [], 'Ava')
  assert.deepEqual(conflicts(mac, ['gluten', 'milk', 'eggs']), ['milk', 'gluten'], 'list order, only what both have')
  assert.deepEqual(conflicts(['soy', 'sesame'], ['sesame', 'soy']), ['sesame', 'soy'])
  assert.equal(allergenWords(['milk']), 'Milk')
  assert.equal(allergenWords(['milk', 'mustard']), 'Milk and Mustard')
  assert.equal(allergenWords(['eggs', 'milk', 'mustard']), 'Eggs, Milk and Mustard')
  assert.deepEqual(cleanAllergenList(['sesame', 'eggs']), ['eggs', 'sesame'])
  assert.equal(cleanAllergenList(['eggs', 'eggs']), null)
  assert.equal(cleanAllergenList(['nuts']), null)
  assert.equal(cleanAllergenList('milk'), null)
  assert.equal(acknowledged(['milk'], ['milk']), true)
  assert.equal(acknowledged(['milk'], []), false)
  assert.equal(acknowledged([], []), true)
  assert.equal(flagOf(['milk'], [[], ['milk']]), 'conflict')
  assert.equal(flagOf(['peanuts'], [[]]), 'allergy')
  assert.equal(flagOf([], [[]]), null)
})

test('balance: the sum of entries with voided ones left out, and the phrase each sum gives', () => {
  const entries = [
    { amount_cents: 1250, voided: false },
    { amount_cents: -300, voided: false },
    { amount_cents: -950, voided: true },
  ]
  assert.equal(sumBalance(entries), 950)
  assert.equal(balancePhrase(sumBalance(entries)), 'You owe $9.50')
  assert.equal(balancePhrase(sumBalance([{ amount_cents: 1250 }, { amount_cents: -1550 }])), 'You have a $3.00 credit')
  assert.equal(balancePhrase(sumBalance([{ amount_cents: 400 }, { amount_cents: -400 }])), 'All paid up')
  assert.equal(balancePhrase(sumBalance([])), 'All paid up')
  assert.equal(orderLabel(5, ['2026-09-25', '2026-09-21', '2026-09-23']), 'Order: 5 items, Mon Sep 21 to Fri Sep 25')
  assert.equal(orderLabel(1, ['2026-09-17']), 'Order: 1 item, Thu Sep 17')
})

test('CSV: quoting and the formula guard', () => {
  assert.equal(textCell('plain'), 'plain')
  assert.equal(textCell('Emma, Jack and Chloe'), '"Emma, Jack and Chloe"')
  assert.equal(textCell('say "hi"'), '"say ""hi"""')
  assert.equal(textCell('two\nlines'), '"two\nlines"')
  assert.equal(textCell('=SUM(A1)'), "'=SUM(A1)")
  for (const bad of ['+1', '-1', '@x', '\tx'])
    assert.equal(textCell(bad)[0] === "'" || textCell(bad).startsWith(`"'`), true, JSON.stringify(bad))
  assert.equal(textCell('\rx'), `"'\rx"`, 'a leading CR is guarded and then quoted')
  assert.equal(textCell('=1,2'), `"'=1,2"`)
  assert.equal(amountCell(1250), '12.50')
  assert.equal(amountCell(-300), '-3.00')
  assert.equal(amountCell(5), '0.05')
  assert.equal(amountCell(0), '0.00')
  assert.equal(
    csvText([
      ['a', 'b'],
      ['1', '2'],
    ]),
    'a,b\r\n1,2\r\n',
  )
})

test('family code normalisation', () => {
  for (const s of ['KQ7M-4RTX', 'kq7m-4rtx', 'KQ7M4RTX', 'kq7m4rtx', ' kq7m 4rtx ', 'K-Q-7-M-4-R-T-X'])
    assert.equal(normalizeCode(s), 'KQ7M4RTX', s)
  for (const s of ['KQ7M-4RT', 'KQ7M-4RTXX', 'KQ7M-4RT1', 'KQ7O-4RTX', 'KQ7M_4RTX', '', null, 12345678])
    assert.equal(normalizeCode(s), null, String(s))
  assert.equal(formatCode('KQ7M4RTX'), 'KQ7M-4RTX')
  assert.equal(CODE_ALPHABET.length, 31)
  for (const ch of 'ILO01') assert.equal(CODE_ALPHABET.includes(ch), false, `no look-alike ${ch}`)
  const codes = new Set(Array.from({ length: 200 }, newCode))
  assert.equal(codes.size, 200)
  for (const c of codes) assert.equal(normalizeCode(c), c.replace('-', ''))
})
