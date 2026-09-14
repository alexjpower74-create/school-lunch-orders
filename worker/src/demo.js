// The demo scenario (docs/API.md "Demo scenario"), anchored to the real today: SAMPLE orders placed "last week" for today and
// the next 8 school days with a menu. Only this seed bypasses the cut-off; every other rule (allergen acks, prices, ledger) holds.
import { conflicts } from './allergens.js'
import { randomId } from './auth.js'
import { isSchoolDay } from './calendar.js'
import { loadCal } from './db.js'
import { closureLabel, insertEntry, orderLabel, paymentLabel, cancelLabel } from './ledger.js'
import { FAMILIES } from './seed.js'
import { addDays, localInstant, localParts } from './time.js'
import { parseList } from './text.js'

const ADD_ONS = new Set(['milk', 'apple', 'cookie'])
const hoursLater = (iso, h) => new Date(new Date(iso).getTime() + h * 3600e3).toISOString()

// One child's lunch for a day: the first main that is safe for them, plus an add-on. Liam also gets White milk, acknowledged
// (his milk allergy), so the kitchen has a conflict row to show.
function pick(child, menu, dayIndex) {
  const safe = (i) => conflicts(i.allergens, child.allergies).length === 0
  const mains = menu.filter((i) => !ADD_ONS.has(i.id) && safe(i))
  const out = []
  if (mains.length) out.push({ item: mains[dayIndex % mains.length], ack: [] })
  const apple = menu.find((i) => i.id === 'apple')
  if (apple && (dayIndex + child.first_name.length) % 2 === 0) out.push({ item: apple, ack: [] })
  if (child.id === 'ch-liam') {
    const milk = menu.find((i) => i.id === 'milk')
    if (milk) out.push({ item: milk, ack: conflicts(milk.allergens, child.allergies) })
  }
  return out
}

export async function seedDemo(c) {
  const db = c.db
  const cal = await loadCal(db)
  const [it, mn] = await db.batch([
    db.prepare('SELECT * FROM items ORDER BY seq'),
    db.prepare('SELECT date, item_id FROM menu WHERE date BETWEEN ? AND ?').bind(cal.school.year_start, cal.school.year_end),
  ])
  const items = new Map(it.results.map((r) => [r.id, { ...r, allergens: parseList(r.allergens) }]))
  const menuOn = (d) => mn.results.filter((r) => r.date === d).map((r) => items.get(r.item_id))
  const withMenu = (d) => isSchoolDay(cal, d) && menuOn(d).length > 0

  // The most recent past school day since year_start gets a storm closure; today and the next 8 school days get orders.
  let past = null
  for (let d = addDays(c.today, -1); cal.school.year_start && d >= cal.school.year_start; d = addDays(d, -1)) {
    if (withMenu(d)) { past = d; break }
  }
  const days = []
  for (let d = c.today; days.length < 9 && cal.school.year_end && d <= cal.school.year_end; d = addDays(d, 1)) if (withMenu(d)) days.push(d)
  const orderDays = past ? [past, ...days] : days
  const placedAt = localInstant(addDays(orderDays[0] || c.today, -7), 19, 30).toISOString()

  const stmts = []
  const linesByFamily = new Map()
  for (const f of FAMILIES) {
    const orderId = randomId('ord')
    const lines = []
    for (const [dayIndex, d] of orderDays.entries()) {
      for (const child of f.children) {
        for (const p of pick(child, menuOn(d), dayIndex)) {
          lines.push({ id: randomId('ln'), date: d, child, item: p.item, ack: p.ack })
        }
      }
    }
    if (!lines.length) continue
    linesByFamily.set(f.id, lines)
    const total = lines.reduce((s, l) => s + l.item.price_cents, 0)
    stmts.push(db.prepare('INSERT INTO orders (id, family_id, placed_at, total_cents, item_count) VALUES (?, ?, ?, ?, ?)')
      .bind(orderId, f.id, placedAt, total, lines.length))
    for (const l of lines) {
      stmts.push(db.prepare(`INSERT INTO lines (id, order_id, family_id, child_id, date, item_id, qty, unit_price_cents, total_cents, ack_allergens,
        placed_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`).bind(l.id, orderId, f.id, l.child.id, l.date, l.item.id, l.item.price_cents,
        l.item.price_cents, JSON.stringify(l.ack), placedAt))
    }
    stmts.push(insertEntry(db, { id: randomId('ent'), family_id: f.id, at: placedAt, kind: 'order', amount_cents: total,
      label: orderLabel(lines.length, lines.map((l) => l.date)) }))
  }

  // Payments: fam-1 pays its first week by e-Transfer; fam-3 sends part in cash; fam-4 has not paid.
  const fam1 = linesByFamily.get('fam-1') || []
  const firstWeekEnd = fam1.length ? addDays(fam1[0].date, 6) : null
  const fam1Week = fam1.filter((l) => l.date <= firstWeekEnd).reduce((s, l) => s + l.item.price_cents, 0)
  if (fam1Week > 0) {
    stmts.push(insertEntry(db, { id: randomId('ent'), family_id: 'fam-1', at: hoursLater(placedAt, 14), kind: 'payment', amount_cents: -fam1Week,
      label: paymentLabel('etransfer'), method: 'etransfer', note: 'SAMPLE e-Transfer' }))
  }
  const fam3 = linesByFamily.get('fam-3') || []
  if (fam3.length) {
    const half = Math.round(fam3.reduce((s, l) => s + l.item.price_cents, 0) / 200) * 100
    stmts.push(insertEntry(db, { id: randomId('ent'), family_id: 'fam-3', at: hoursLater(placedAt, 20), kind: 'payment', amount_cents: -half,
      label: paymentLabel('cash'), method: 'cash', note: 'SAMPLE envelope' }))
  }

  // One cancellation credit: Jack's last lunch in the list, cancelled the morning after ordering (before its cut-off).
  const jack = fam3.filter((l) => l.child.id === 'ch-jack' && l.date !== past)
  const cancelled = jack[jack.length - 1]
  if (cancelled) {
    stmts.push(db.prepare("UPDATE lines SET status = 'cancelled', changed_at = ? WHERE id = ?").bind(hoursLater(placedAt, 13), cancelled.id))
    stmts.push(insertEntry(db, { id: randomId('ent'), family_id: 'fam-3', at: hoursLater(placedAt, 13), kind: 'cancel',
      amount_cents: -cancelled.item.price_cents, label: cancelLabel(cancelled.item.name, 1, 'Jack', cancelled.date) }))
  }
  await db.batch(stmts)

  // The storm closure on the most recent past school day: that day's lines closed and credited, one entry per family.
  if (past) {
    const closedAt = localInstant(past, 6, 45).toISOString()
    const note = 'Storm closure (SAMPLE)'
    const credit = new Map()
    for (const [familyId, lines] of linesByFamily) {
      for (const l of lines) if (l.date === past && l !== cancelled) credit.set(familyId, (credit.get(familyId) || 0) + l.item.price_cents)
    }
    await db.batch([
      db.prepare('INSERT INTO no_school (date, kind, note, created_at) VALUES (?, ?, ?, ?)').bind(past, 'closure', note, closedAt),
      db.prepare("UPDATE lines SET status = 'closed', changed_at = ? WHERE date = ? AND status = 'active'").bind(closedAt, past),
      ...[...credit].map(([familyId, cents]) => insertEntry(db, { id: randomId('ent'), family_id: familyId, at: closedAt, kind: 'closure',
        amount_cents: -cents, label: closureLabel('closure', past), note })),
    ])
  }

  // After noon on a school day, about half of Room 4's lunches are already given out.
  if (days[0] === c.today && localParts(c.now).hour >= 12) {
    const { results } = await db.prepare(`SELECT DISTINCT l.child_id FROM lines l JOIN children ch ON ch.id = l.child_id
      WHERE l.date = ? AND l.status = 'active' AND ch.class_id = 'room-2' ORDER BY ch.first_name`).bind(c.today).all()
    const half = results.slice(0, Math.ceil(results.length / 2))
    if (half.length) {
      await db.batch(half.map((r) => db.prepare("INSERT INTO deliveries (date, child_id, state, staff_id, at) VALUES (?, ?, 'delivered', 'st-oldford', ?)")
        .bind(c.today, r.child_id, c.nowIso)))
    }
  }

  return FAMILIES.map((f) => ({ id: f.id, label: f.label, code: f.code }))
}
