// Pure: home-local dates, labels and instants in America/St_Johns, across both DST changes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addDays, dateLabel, daysBetween, isValidDate, localDate, localHHMM, localInstant, longLabel, nextMidnight, startOfDate, timeLabel,
} from '../src/time.js'

const iso = (d) => d.toISOString()

test('time labels: bare time, 12:00 AM for midnight and 12:00 PM for noon (NDT)', () => {
  assert.equal(timeLabel('2026-09-14T02:30:00Z'), '12:00 AM')
  assert.equal(timeLabel('2026-09-14T14:30:00Z'), '12:00 PM')
  assert.equal(timeLabel('2026-09-14T17:35:00Z'), '3:05 PM')
  assert.equal(timeLabel('2026-09-14T11:29:00Z'), '8:59 AM')
  assert.equal(timeLabel('2026-09-15T02:29:00Z'), '11:59 PM')
  assert.equal(localHHMM('2026-09-14T17:30:00Z'), '15:00')
  assert.equal(localHHMM('2026-09-14T02:30:00Z'), '00:00')
})

test('date labels: "Mon Sep 14" and "Monday, September 14"', () => {
  assert.equal(dateLabel('2026-09-14'), 'Mon Sep 14')
  assert.equal(longLabel('2026-09-14'), 'Monday, September 14')
  assert.equal(dateLabel('2026-11-01'), 'Sun Nov 1')
  assert.equal(longLabel('2027-03-14'), 'Sunday, March 14')
})

test('local date at 11:59 PM and at 12:00 AM NDT', () => {
  assert.equal(localDate('2026-09-15T02:29:59.999Z'), '2026-09-14', '11:59:59 PM Sep 14 NDT is still Sep 14 (UTC is already Sep 15)')
  assert.equal(localDate('2026-09-15T02:30:00Z'), '2026-09-15', '12:00 AM Sep 15 NDT')
  assert.equal(localDate('2026-09-15T00:00:00Z'), '2026-09-14', 'UTC midnight is 9:30 PM in Newfoundland')
})

test('local 21:00 → instant: Sep 14 2026 NDT, Nov 1 2026 after fall-back NST, Mar 14 2027 after spring-forward NDT', () => {
  assert.equal(iso(localInstant('2026-09-14', 21, 0)), '2026-09-14T23:30:00.000Z')
  assert.equal(iso(localInstant('2026-11-01', 21, 0)), '2026-11-02T00:30:00.000Z')
  assert.equal(iso(localInstant('2027-03-14', 21, 0)), '2027-03-14T23:30:00.000Z')
  assert.equal(iso(localInstant('2026-10-31', 21, 0)), '2026-10-31T23:30:00.000Z', 'the day before fall-back is still NDT')
})

test('midnights: the one after Nov 1 2026 is 2026-11-02T03:30:00Z; 24:00 is the next midnight', () => {
  assert.equal(iso(startOfDate('2026-11-02')), '2026-11-02T03:30:00.000Z')
  assert.equal(iso(nextMidnight('2026-11-02T00:30:00Z')), '2026-11-02T03:30:00.000Z')
  assert.equal(iso(startOfDate('2026-11-01')), '2026-11-01T02:30:00.000Z', 'Nov 1 starts in NDT')
  assert.equal(iso(localInstant('2026-11-01', 24, 0)), '2026-11-02T03:30:00.000Z')
  assert.equal(iso(localInstant('2027-03-14', 0, 0)), '2027-03-14T03:30:00.000Z', 'Mar 14 starts in NST')
  assert.equal(iso(startOfDate('2027-03-15')), '2027-03-15T02:30:00.000Z', 'Mar 15 starts in NDT')
})

test('the repeated hour (1:30 AM Nov 1 2026) is the first; the missing hour (2:30 AM Mar 14 2027) is one hour later', () => {
  const first = localInstant('2026-11-01', 1, 30)
  assert.equal(iso(first), '2026-11-01T04:00:00.000Z', 'first 1:30 AM, still NDT')
  assert.equal(localHHMM('2026-11-01T05:00:00Z'), '01:30', 'the second 1:30 AM exists one hour later (NST)')
  const missing = localInstant('2027-03-14', 2, 30)
  assert.equal(iso(missing), '2027-03-14T06:00:00.000Z')
  assert.equal(timeLabel(missing), '3:30 AM', 'the clock jumps from 1:59 AM to 3:00 AM')
  assert.equal(iso(localInstant('2027-03-14', 1, 59)), '2027-03-14T05:29:00.000Z')
  assert.equal(iso(localInstant('2027-03-14', 3, 0)), '2027-03-14T05:30:00.000Z')
})

test('calendar helpers: valid dates, adding days across months and years, days between', () => {
  assert.ok(isValidDate('2026-09-14'))
  for (const bad of ['2026-02-30', '2026-9-14', '14-09-2026', '', null, '2026-13-01']) assert.equal(isValidDate(bad), false, String(bad))
  assert.equal(addDays('2026-09-14', 30), '2026-10-14')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(daysBetween('2026-10-02', '2026-11-01'), 30)
  assert.equal(daysBetween('2027-03-01', '2027-03-31'), 30)
})
