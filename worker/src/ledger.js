// A family's money is a list of entries; the balance is their sum (voided ones left out). Positive = owes, negative = credit.
// Nothing old is edited: a void only marks the entry.
import { KIND_LABELS } from './calendar.js'
import { dateLabel, localDate, timeLabel } from './time.js'
import { plural } from './text.js'

export const METHODS = ['etransfer', 'cash', 'cheque', 'other']
export const METHOD_LABELS = { etransfer: 'e-Transfer', cash: 'Cash', cheque: 'Cheque', other: 'Other' }
export const ENTRY_KIND_WORDS = { order: 'Order', cancel: 'Cancel', closure: 'Closure credit', payment: 'Payment', adjustment: 'Adjustment' }

/** "Mon Sep 14, 3:05 PM" */
export const atLabel = (iso) => `${dateLabel(localDate(iso))}, ${timeLabel(iso)}`

export const entryOut = (r) => ({
  id: r.id, at: r.at, at_label: atLabel(r.at), date: r.date, kind: r.kind, amount_cents: r.amount_cents, label: r.label,
  method: r.method ?? null, note: r.note || '', voided: !!r.voided,
})

/** Pure: the balance of a list of entries. */
export const sumBalance = (entries) => entries.reduce((s, e) => (e.voided ? s : s + e.amount_cents), 0)

export async function balanceOf(db, familyId) {
  const r = await db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS b FROM entries WHERE family_id = ? AND voided = 0')
    .bind(familyId).first()
  return r.b
}

export function insertEntry(db, { id, family_id, at, kind, amount_cents, label, method = null, note = '' }) {
  return db.prepare(`INSERT INTO entries (id, family_id, at, date, kind, amount_cents, label, method, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, family_id, at, localDate(at), kind, amount_cents, label, method, note)
}

/** "Order: 5 items, Mon Sep 21 to Fri Sep 25" / "Order: 1 item, Thu Sep 17" */
export function orderLabel(itemCount, dates) {
  const sorted = [...dates].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const when = first === last ? dateLabel(first) : `${dateLabel(first)} to ${dateLabel(last)}`
  return `Order: ${plural(itemCount, 'item')}, ${when}`
}

/** "Cancelled: Macaroni and cheese ×2 for Liam, Thu Sep 17" */
export const cancelLabel = (itemName, qty, firstName, date) => `Cancelled: ${itemName} ×${qty} for ${firstName}, ${dateLabel(date)}`

/** "Credit: School closed Wed Sep 23" */
export const closureLabel = (kind, date) => `Credit: ${KIND_LABELS[kind]} ${dateLabel(date)}`

export const paymentLabel = (method) => `Payment: ${METHOD_LABELS[method]}`
