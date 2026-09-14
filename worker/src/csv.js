// CSV for the office (docs/API.md "CSV rules"). Pure.

const quote = (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** A text cell. A leading =, +, -, @, tab or CR gets a ' so a spreadsheet never runs it as a formula. */
export function textCell(value) {
  let s = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return quote(s)
}

/** 1250 → "12.50", -300 → "-3.00". Written as a number, never prefixed. */
export function amountCell(cents) {
  const a = Math.abs(cents)
  return `${cents < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`
}

/** rows of already-encoded cells → CRLF text with a trailing CRLF */
export const csvText = (rows) => rows.map((r) => r.join(',')).join('\r\n') + '\r\n'
