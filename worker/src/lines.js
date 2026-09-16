// Order lines as the family sees them (docs/API.md "Line"). A line's price is the snapshot taken when it was placed.
import { acknowledged, conflicts } from './allergens.js'
import { cutoffAt, cutoffLabel, isPastCutoff } from './calendar.js'
import { dateLabel } from './time.js'
import { parseList } from './text.js'

export const LINE_STATUS_LABELS = { active: 'Ordered', cancelled: 'Cancelled', closed: 'No school, credited' }

export const LINE_SELECT = `SELECT l.id, l.order_id, l.family_id, l.child_id, l.date, l.item_id, l.qty, l.unit_price_cents, l.total_cents,
  l.status, l.ack_allergens, l.placed_at, ch.first_name, ch.allergies AS child_allergies, i.name AS item_name, i.allergens AS item_allergens,
  d.state AS delivery
  FROM lines l JOIN children ch ON ch.id = l.child_id JOIN items i ON i.id = l.item_id
  LEFT JOIN deliveries d ON d.date = l.date AND d.child_id = l.child_id`
export const LINE_ORDER = 'ORDER BY l.date, ch.first_name, i.name, l.seq'

// conflicts and acknowledged are computed as the kitchen computes them: the child's allergies and the item's allergens now.
export function lineOut(r, cal, now) {
  const at = cutoffAt(cal, r.date)
  const ack = parseList(r.ack_allergens)
  const cs = conflicts(parseList(r.item_allergens), parseList(r.child_allergies))
  return {
    id: r.id,
    order_id: r.order_id,
    child_id: r.child_id,
    first_name: r.first_name,
    date: r.date,
    date_label: dateLabel(r.date),
    item_id: r.item_id,
    item_name: r.item_name,
    qty: r.qty,
    unit_price_cents: r.unit_price_cents,
    total_cents: r.total_cents,
    status: r.status,
    status_label: LINE_STATUS_LABELS[r.status],
    ack_allergens: ack,
    conflicts: cs,
    acknowledged: acknowledged(cs, ack),
    can_cancel: r.status === 'active' && !isPastCutoff(at, now),
    cutoff_at: at.toISOString(),
    cutoff_label: cutoffLabel(cal, r.date, at, now),
    delivery: r.delivery || null,
    placed_at: r.placed_at,
  }
}
