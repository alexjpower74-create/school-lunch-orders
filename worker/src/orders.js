// Placing an order, cancelling a line and confirming a late allergy (docs/API.md "Placing an order"). checkOrder is pure: the first failing check, in
// the contract's order, rejects the whole request, and nothing is stored.
import { allergenWords, conflicts } from './allergens.js'
import { randomId } from './auth.js'
import { cutoffAt, cutoffWhen, isPastCutoff, isSchoolDay, noSchoolInfo } from './calendar.js'
import { loadCal, readJson } from './db.js'
import { ApiError, conflict, json, notFound } from './http.js'
import { balanceOf, cancelLabel, insertEntry, orderLabel } from './ledger.js'
import { LINE_ORDER, LINE_SELECT, lineOut } from './lines.js'
import { dateLabel, isValidDate } from './time.js'
import { parseList } from './text.js'

const badLine = (index, message) => new ApiError(400, 'bad_request', message, { field: 'lines', index })

export const cutoffMessage = (cal, date) => `Ordering for ${dateLabel(date)} closed at ${cutoffWhen(cal, date)}.`

/**
 * lines: the request's lines. children: Map id → { id, first_name, allergies: [keys] } (this family's, not removed).
 * items: Map id → { id, name, price_cents, allergens, max_per_child }. menu: Set of "date|item_id". existing: Map
 * "child|date|item" → active qty already ordered. Returns the lines with child, item and ack_allergens, or throws an ApiError.
 */
export function checkOrder({ lines, children, items, cal, menu, existing, now }) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 60) {
    throw new ApiError(400, 'bad_request', 'An order needs 1 to 60 lunches.', { field: 'lines' })
  }
  const keys = new Set()
  lines.forEach((l, index) => {
    if (!l || typeof l !== 'object' || Array.isArray(l)) throw badLine(index, 'Something was missing from that lunch.')
    if (typeof l.child_id !== 'string' || typeof l.item_id !== 'string') throw badLine(index, 'Something was missing from that lunch.')
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 10) throw badLine(index, 'Choose a number from 1 to 10.')
    if (!isValidDate(l.date)) throw badLine(index, 'Choose a day.')
    if ('allergen_ack' in l && typeof l.allergen_ack !== 'boolean') throw badLine(index, 'Tick "I understand" or leave it unticked.')
    const key = `${l.child_id}|${l.date}|${l.item_id}`
    if (keys.has(key)) throw badLine(index, 'That lunch is in the order twice.')
    keys.add(key)
  })
  lines.forEach((l, index) => {
    if (!children.has(l.child_id)) throw new ApiError(404, 'not_found', "That child isn't on your family.", { index })
    if (!items.has(l.item_id)) throw new ApiError(404, 'not_found', "That menu item isn't on the list.", { index })
  })
  lines.forEach((l, index) => {
    if (isSchoolDay(cal, l.date)) return
    const n = noSchoolInfo(cal, l.date)
    const words = n ? `There's no school on ${dateLabel(l.date)} (${n.kind_label}).` : `There's no school on ${dateLabel(l.date)}.`
    throw conflict('no_school', words, { index, date: l.date })
  })
  lines.forEach((l, index) => {
    if (!menu.has(`${l.date}|${l.item_id}`)) {
      throw conflict('not_on_menu', `${items.get(l.item_id).name} isn't on the menu for ${dateLabel(l.date)}.`, { index })
    }
  })
  lines.forEach((l, index) => {
    if (isPastCutoff(cutoffAt(cal, l.date), now)) throw conflict('cutoff_passed', cutoffMessage(cal, l.date), { index, date: l.date })
  })
  lines.forEach((l, index) => {
    const item = items.get(l.item_id)
    const already = existing.get(`${l.child_id}|${l.date}|${l.item_id}`) || 0
    if (item.max_per_child !== null && already + l.qty > item.max_per_child) {
      throw conflict('over_max', `${children.get(l.child_id).first_name} can have at most ${item.max_per_child} of ${item.name} on ${dateLabel(l.date)}.`, { index })
    }
  })
  const needAck = []
  const out = lines.map((l, index) => {
    const child = children.get(l.child_id)
    const item = items.get(l.item_id)
    const cs = conflicts(item.allergens, child.allergies)
    if (cs.length && l.allergen_ack !== true) {
      needAck.push({ index, child_id: child.id, first_name: child.first_name, item_id: item.id, item_name: item.name, allergens: cs })
    }
    return { ...l, child, item, ack_allergens: l.allergen_ack === true ? cs : [] }
  })
  if (needAck.length) {
    const f = needAck[0]
    throw conflict('allergen_ack_required',
      `${f.first_name} is allergic to ${allergenWords(f.allergens)}. ${f.item_name} contains ${allergenWords(f.allergens)}. Tick "I understand" to order it anyway.`,
      { lines: needAck })
  }
  return out
}

export async function placeOrder(c) {
  const body = await readJson(c)
  const cal = await loadCal(c.db)
  const raw = Array.isArray(body.lines) ? body.lines : []
  const dates = [...new Set(raw.map((l) => l?.date).filter(isValidDate))].sort()
  const lo = dates[0] || '0000-01-01'
  const hi = dates[dates.length - 1] || '0000-01-01'
  const [ch, it, mn, ex] = await c.db.batch([
    c.db.prepare('SELECT id, first_name, allergies FROM children WHERE family_id = ? AND removed = 0').bind(c.family.id),
    c.db.prepare('SELECT id, name, price_cents, allergens, max_per_child FROM items'),
    c.db.prepare('SELECT date, item_id FROM menu WHERE date BETWEEN ? AND ?').bind(lo, hi),
    c.db.prepare(`SELECT child_id, date, item_id, SUM(qty) AS qty FROM lines WHERE family_id = ? AND status = 'active' AND date BETWEEN ? AND ?
      GROUP BY child_id, date, item_id`).bind(c.family.id, lo, hi),
  ])
  const lines = checkOrder({
    lines: body.lines,
    children: new Map(ch.results.map((r) => [r.id, { id: r.id, first_name: r.first_name, allergies: parseList(r.allergies) }])),
    items: new Map(it.results.map((r) => [r.id, { ...r, allergens: parseList(r.allergens), max_per_child: r.max_per_child ?? null }])),
    cal,
    menu: new Set(mn.results.map((r) => `${r.date}|${r.item_id}`)),
    existing: new Map(ex.results.map((r) => [`${r.child_id}|${r.date}|${r.item_id}`, r.qty])),
    now: c.now,
  })

  const orderId = randomId('ord')
  const total = lines.reduce((s, l) => s + l.qty * l.item.price_cents, 0)
  const itemCount = lines.reduce((s, l) => s + l.qty, 0)
  await c.db.batch([
    c.db.prepare('INSERT INTO orders (id, family_id, placed_at, total_cents, item_count) VALUES (?, ?, ?, ?, ?)')
      .bind(orderId, c.family.id, c.nowIso, total, itemCount),
    ...lines.map((l) => c.db.prepare(`INSERT INTO lines (id, order_id, family_id, child_id, date, item_id, qty, unit_price_cents, total_cents,
      ack_allergens, placed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(randomId('ln'), orderId, c.family.id, l.child.id, l.date, l.item.id,
      l.qty, l.item.price_cents, l.qty * l.item.price_cents, JSON.stringify(l.ack_allergens), c.nowIso)),
    insertEntry(c.db, { id: randomId('ent'), family_id: c.family.id, at: c.nowIso, kind: 'order', amount_cents: total,
      label: orderLabel(itemCount, lines.map((l) => l.date)) }),
  ])
  const { results } = await c.db.prepare(`${LINE_SELECT} WHERE l.order_id = ? ${LINE_ORDER}`).bind(orderId).all()
  return json({
    order: { id: orderId, placed_at: c.nowIso, total_cents: total, item_count: itemCount, lines: results.map((r) => lineOut(r, cal, c.now)) },
    balance_cents: await balanceOf(c.db, c.family.id),
  }, 201)
}

export async function cancelLine(c, { id }) {
  const r = await c.db.prepare(`${LINE_SELECT} WHERE l.id = ? AND l.family_id = ?`).bind(id, c.family.id).first()
  if (!r) throw notFound("That lunch isn't on your family's orders.")
  if (r.status !== 'active') throw conflict('bad_state', 'That lunch is already cancelled.')
  const cal = await loadCal(c.db)
  if (isPastCutoff(cutoffAt(cal, r.date), c.now)) throw conflict('cutoff_passed', cutoffMessage(cal, r.date), { date: r.date })
  await c.db.batch([
    c.db.prepare("UPDATE lines SET status = 'cancelled', changed_at = ? WHERE id = ? AND status = 'active'").bind(c.nowIso, id),
    insertEntry(c.db, { id: randomId('ent'), family_id: r.family_id, at: c.nowIso, kind: 'cancel', amount_cents: -r.total_cents,
      label: cancelLabel(r.item_name, r.qty, r.first_name, r.date) }),
  ])
  const after = await c.db.prepare(`${LINE_SELECT} WHERE l.id = ?`).bind(id).first()
  return json({ line: lineOut(after, cal, c.now), balance_cents: await balanceOf(c.db, c.family.id) })
}

// "I understand, keep it": an allergy ticked after ordering is confirmed for that line. No cut-off (nothing the kitchen counts
// changes); refused for a line that is not active, a day that has passed, or a line with nothing to confirm.
export async function ackLine(c, { id }) {
  const r = await c.db.prepare(`${LINE_SELECT} WHERE l.family_id = ? AND l.id = ?`).bind(c.family.id, id).first()
  if (!r) throw notFound("That lunch isn't on your family's orders.")
  if (r.status !== 'active') throw conflict('bad_state', 'That lunch is already cancelled.')
  if (r.date < c.today) throw conflict('bad_state', 'That lunch was for a day that has passed.')
  const cal = await loadCal(c.db)
  const line = lineOut(r, cal, c.now)
  if (!line.conflicts.length) throw conflict('bad_state', "There's nothing to confirm on that lunch.")
  await c.db.prepare('UPDATE lines SET ack_allergens = ?, changed_at = ? WHERE id = ?').bind(JSON.stringify(line.conflicts), c.nowIso, id).run()
  const after = await c.db.prepare(`${LINE_SELECT} WHERE l.id = ?`).bind(id).first()
  return json({ line: lineOut(after, cal, c.now) })
}
