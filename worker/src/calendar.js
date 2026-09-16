// The school calendar (docs/API.md "The school calendar"): school days, cut-offs, day status and week labels. Pure, so the
// unit tests run it in node. A calendar is { school, noSchool: Map<date, { date, kind, note }> }.
import { addDays, clockLabel, dateLabel, localInstant } from './time.js'

export const DEFAULT_SCHOOL = {
  school_name: '',
  sample: false,
  payment_instructions: '',
  cutoff_days_before: 1,
  cutoff_time: '09:00',
  year_start: null,
  year_end: null,
}

export const KINDS = ['holiday', 'pd_day', 'closure']
export const KIND_LABELS = { holiday: 'Holiday', pd_day: 'PD day', closure: 'School closed' }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function makeCal(school, noSchoolRows = []) {
  return { school: { ...DEFAULT_SCHOOL, ...(school || {}) }, noSchool: new Map(noSchoolRows.map((r) => [r.date, r])) }
}

/** Monday 1 … Sunday 7 */
export function weekday(date) {
  const [y, m, d] = date.split('-').map(Number)
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1
}
export const isWeekday = (date) => weekday(date) <= 5

export const inYear = (cal, date) =>
  !!cal.school.year_start && !!cal.school.year_end && date >= cal.school.year_start && date <= cal.school.year_end

export const isSchoolDay = (cal, date) => isWeekday(date) && inYear(cal, date) && !cal.noSchool.has(date)

// Planned days off move a cut-off; a closure (added on the day) never does.
const isPlannedDayOff = (cal, date) => {
  const n = cal.noSchool.get(date)
  return !!n && (n.kind === 'holiday' || n.kind === 'pd_day')
}

/** The date whose cutoff_time closes ordering for weekday D. */
export function cutoffDate(cal, date) {
  let p = date
  for (let i = 0; i < cal.school.cutoff_days_before; i++) {
    do p = addDays(p, -1)
    while (!isWeekday(p) || isPlannedDayOff(cal, p))
  }
  return p
}

const hhmm = (cal) => cal.school.cutoff_time.split(':').map(Number)

/** The instant ordering for D closes (a Date). */
export function cutoffAt(cal, date) {
  const [hh, mm] = hhmm(cal)
  return localInstant(cutoffDate(cal, date), hh, mm)
}

/** Open for orders means T < cutoff_at; at exactly cutoff_at it is closed. */
export const isPastCutoff = (at, now) => now.getTime() >= at.getTime()

/** "9:00 AM Fri Sep 18" */
export function cutoffWhen(cal, date) {
  const [hh, mm] = hhmm(cal)
  return `${clockLabel(hh, mm)} ${dateLabel(cutoffDate(cal, date))}`
}

/** "Order by 9:00 AM Fri Sep 18" / "Ordering closed at 9:00 AM Fri Sep 18"; null on a day that is not a school day. */
export function cutoffLabel(cal, date, at, now) {
  if (!isSchoolDay(cal, date)) return null
  return isPastCutoff(at, now) ? `Ordering closed at ${cutoffWhen(cal, date)}` : `Order by ${cutoffWhen(cal, date)}`
}

export function cutoffRuleLabel(days, time) {
  const [hh, mm] = time.split(':').map(Number)
  const t = clockLabel(hh, mm)
  if (days === 0) return `Order by ${t} on the day.`
  if (days === 1) return `Order by ${t} the school day before.`
  return `Order by ${t} ${days} school days before.`
}

export function noSchoolInfo(cal, date) {
  const n = cal.noSchool.get(date)
  return n ? { kind: n.kind, kind_label: KIND_LABELS[n.kind], note: n.note || '' } : null
}

/** A parent's view of a weekday: no_school, no_menu, closed, open (the first that applies). */
export function dayStatus(cal, date, { hasMenu, at, now }) {
  const n = cal.noSchool.get(date)
  if (n) return { status: 'no_school', status_label: KIND_LABELS[n.kind] }
  if (!isWeekday(date) || !inYear(cal, date)) return { status: 'no_school', status_label: 'No school' }
  if (!hasMenu) return { status: 'no_menu', status_label: 'No menu yet' }
  if (isPastCutoff(at, now)) return { status: 'closed', status_label: 'Closed for orders' }
  return { status: 'open', status_label: 'Open' }
}

/** The staff view of any date: weekend, no_school, outside_year, school_day. */
export function staffStatus(cal, date) {
  if (!isWeekday(date)) return { status: 'weekend', status_label: 'Weekend' }
  const n = cal.noSchool.get(date)
  if (n) return { status: 'no_school', status_label: KIND_LABELS[n.kind] }
  if (!inYear(cal, date)) return { status: 'outside_year', status_label: 'Outside the school year' }
  return { status: 'school_day', status_label: 'School day' }
}

/** The Monday of the week holding D. */
export const weekStart = (date) => addDays(date, 1 - weekday(date))

/** "Sep 21 to 25" or "Sep 28 to Oct 2" for the week starting on a Monday. */
export function weekLabel(monday) {
  const friday = addDays(monday, 4)
  const [, m1, d1] = monday.split('-').map(Number)
  const [, m2, d2] = friday.split('-').map(Number)
  return m1 === m2 ? `${MONTHS[m1 - 1]} ${d1} to ${d2}` : `${MONTHS[m1 - 1]} ${d1} to ${MONTHS[m2 - 1]} ${d2}`
}

/** The first school day strictly after today, or null when none is left before year_end. */
export function nextSchoolDay(cal, today) {
  if (!cal.school.year_end) return null
  let d = addDays(today, 1)
  if (cal.school.year_start && d < cal.school.year_start) d = cal.school.year_start
  for (; d <= cal.school.year_end; d = addDays(d, 1)) if (isSchoolDay(cal, d)) return d
  return null
}
