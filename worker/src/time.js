// Home-local dates, labels and instants in America/St_Johns. Pure (Intl only), so the unit tests run it in node.
export const TZ = 'America/St_Johns'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December']
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
})

// The wall clock in St. John's at an instant: { date: 'YYYY-MM-DD', hour, minute, second }.
export function localParts(instant) {
  const p = {}
  for (const x of partsFormat.formatToParts(new Date(instant))) p[x.type] = x.value
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second) }
}

export const localDate = (instant) => localParts(instant).date

// "09:00"
export function localHHMM(instant) {
  const { hour, minute } = localParts(instant)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const utcOf = (date) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function isValidDate(date) {
  return typeof date === 'string' && DATE_RE.test(date) && utcOf(date).toISOString().slice(0, 10) === date
}

export function addDays(date, n) {
  const t = utcOf(date)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

// Whole calendar days from a to b (b − a).
export const daysBetween = (a, b) => Math.round((utcOf(b) - utcOf(a)) / 86400000)

// "Mon Sep 14"
export function dateLabel(date) {
  const t = utcOf(date)
  return `${DAYS[(t.getUTCDay() + 6) % 7].slice(0, 3)} ${MONTHS[t.getUTCMonth()].slice(0, 3)} ${t.getUTCDate()}`
}

// "Monday, September 14"
export function longLabel(date) {
  const t = utcOf(date)
  return `${DAYS[(t.getUTCDay() + 6) % 7]}, ${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`
}

// "3:05 PM" for a wall time given as hours and minutes ("12:00 AM" midnight, "12:00 PM" noon).
export const clockLabel = (hour, minute) =>
  `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`

// "3:05 PM" at an instant.
export function timeLabel(instant) {
  const { hour, minute } = localParts(instant)
  return clockLabel(hour, minute)
}

// The instant of a St. John's wall time on a date, with the offset in effect at that wall time. Newfoundland is UTC−2:30
// (NDT) or UTC−3:30 (NST). A wall time that happens twice (fall-back) is the first; one that does not exist (spring-forward,
// 2:00–2:59 AM) is the instant one hour later on the wall clock. Hour 24:00 is the next local midnight.
export function localInstant(date, hour = 0, minute = 0) {
  if (hour === 24 && minute === 0) return localInstant(addDays(date, 1), 0, 0)
  const [y, m, d] = date.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d, hour, minute)
  const hits = [150, 210].map((off) => wall + off * 60000).filter((t) => {
    const p = localParts(t)
    return p.date === date && p.hour === hour && p.minute === minute
  })
  if (hits.length) return new Date(Math.min(...hits))
  // In the gap the standard-time offset still reads the wall time as written, which the clock shows one hour later.
  return new Date(wall + 210 * 60000)
}

// The local midnight that starts a date, and the one after an instant. DST changes at 2:00 AM, so midnight exists once.
export const startOfDate = (date) => localInstant(date, 0, 0)
export const nextMidnight = (instant) => startOfDate(addDays(localDate(instant), 1))
