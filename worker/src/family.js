// A family's own data: children, the menu by week, orders and the ledger (docs/API.md "Family routes").
import { cleanAllergenList } from './allergens.js'
import { randomId } from './auth.js'
import { cutoffAt, cutoffLabel, dayStatus, isPastCutoff, isSchoolDay, noSchoolInfo, weekLabel, weekStart, weekday } from './calendar.js'
import { CHILD_SELECT, childOut, classOut, loadCal, menuItemOut, readJson } from './db.js'
import { bad, conflict, json, notFound } from './http.js'
import { balanceOf, entryOut } from './ledger.js'
import { LINE_ORDER, LINE_SELECT, lineOut } from './lines.js'
import { addDays, dateLabel, isValidDate, longLabel } from './time.js'

export const MAX_CHILDREN = 8
const NAME_RE = /^\p{L}[\p{L} '\-]*$/u

export async function getFamily(c) {
  const cal = await loadCal(c.db)
  const [ch, cl] = await c.db.batch([
    c.db.prepare(`${CHILD_SELECT} WHERE ch.family_id = ? AND ch.removed = 0 ORDER BY ch.first_name, ch.seq`).bind(c.family.id),
    c.db.prepare('SELECT * FROM classes ORDER BY sort, name'),
  ])
  return json({
    family: c.family, children: ch.results.map(childOut), classes: cl.results.map(classOut),
    balance_cents: await balanceOf(c.db, c.family.id), payment_instructions: cal.school.payment_instructions,
  })
}

async function childInput(c, body) {
  const raw = typeof body.first_name === 'string' ? body.first_name.trim().replace(/\s+/g, ' ') : ''
  if (!raw || [...raw].length > 30 || !NAME_RE.test(raw)) {
    throw bad('first_name', "Type your child's first name (letters, spaces, - and ' only, up to 30).")
  }
  if (typeof body.class_id !== 'string' || !(await c.db.prepare('SELECT id FROM classes WHERE id = ?').bind(body.class_id).first())) {
    throw bad('class_id', "Choose your child's class.")
  }
  const allergies = cleanAllergenList(body.allergies)
  if (!allergies) throw bad('allergies', 'Tick allergies from the list.')
  return { first_name: raw, class_id: body.class_id, allergies }
}

async function ownChild(c, id) {
  const r = await c.db.prepare(`${CHILD_SELECT} WHERE ch.id = ? AND ch.family_id = ? AND ch.removed = 0`).bind(id, c.family.id).first()
  if (!r) throw notFound("That child isn't on your family.")
  return r
}

const readChild = async (c, id) => childOut(await c.db.prepare(`${CHILD_SELECT} WHERE ch.id = ?`).bind(id).first())

export async function addChild(c) {
  const k = await childInput(c, await readJson(c))
  const n = await c.db.prepare('SELECT COUNT(*) AS n FROM children WHERE family_id = ? AND removed = 0').bind(c.family.id).first()
  if (n.n >= MAX_CHILDREN) throw conflict('bad_state', `A family can have at most ${MAX_CHILDREN} children. Ask the office if you need more.`)
  const id = randomId('ch')
  await c.db.prepare('INSERT INTO children (id, family_id, first_name, class_id, allergies, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, c.family.id, k.first_name, k.class_id, JSON.stringify(k.allergies), c.nowIso).run()
  return json({ child: await readChild(c, id) }, 201)
}

export async function updateChild(c, { id }) {
  await ownChild(c, id)
  const k = await childInput(c, await readJson(c))
  await c.db.prepare('UPDATE children SET first_name = ?, class_id = ?, allergies = ? WHERE id = ?')
    .bind(k.first_name, k.class_id, JSON.stringify(k.allergies), id).run()
  return json({ child: await readChild(c, id) })
}

export async function removeChild(c, { id }) {
  const ch = await ownChild(c, id)
  const r = await c.db.prepare("SELECT COUNT(*) AS n FROM lines WHERE child_id = ? AND status = 'active' AND date >= ?").bind(id, c.today).first()
  if (r.n) throw conflict('bad_state', `${ch.first_name} has lunches ordered for days still to come. Cancel them first.`)
  await c.db.prepare('UPDATE children SET removed = 1 WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

export async function familyMenu(c) {
  const cal = await loadCal(c.db)
  const q = c.url.searchParams.get('week')
  let monday
  if (q) {
    if (!isValidDate(q)) throw bad('week', 'Choose a week.')
    monday = weekStart(q)
  } else {
    // The week of the first open day from today on (searching 8 weeks), else the week holding today (a weekend: the next week).
    const end = addDays(c.today, 55)
    const { results } = await c.db.prepare('SELECT DISTINCT date FROM menu WHERE date BETWEEN ? AND ?').bind(c.today, end).all()
    const withMenu = new Set(results.map((r) => r.date))
    let found = null
    for (let d = c.today; d <= end && !found; d = addDays(d, 1)) {
      if (isSchoolDay(cal, d) && withMenu.has(d) && !isPastCutoff(cutoffAt(cal, d), c.now)) found = d
    }
    monday = found ? weekStart(found) : weekStart(weekday(c.today) >= 6 ? addDays(c.today, 7) : c.today)
  }
  const dates = [0, 1, 2, 3, 4].map((i) => addDays(monday, i))
  const { results: rows } = await c.db.prepare(`SELECT m.date, i.* FROM menu m JOIN items i ON i.id = m.item_id
    WHERE m.date BETWEEN ? AND ? ORDER BY i.seq`).bind(dates[0], dates[4]).all()
  const days = dates.map((date) => {
    const items = rows.filter((r) => r.date === date).map(menuItemOut)
    const schoolDay = isSchoolDay(cal, date)
    const at = schoolDay ? cutoffAt(cal, date) : null
    const st = dayStatus(cal, date, { hasMenu: items.length > 0, at, now: c.now })
    return {
      date, date_label: dateLabel(date), long_label: longLabel(date), status: st.status, status_label: st.status_label,
      no_school: noSchoolInfo(cal, date), cutoff_at: at ? at.toISOString() : null, cutoff_label: at ? cutoffLabel(cal, date, at, c.now) : null,
      items: st.status === 'no_school' ? [] : items,
    }
  })
  return json({ week_start: monday, week_label: weekLabel(monday), prev_week: addDays(monday, -7), next_week: addDays(monday, 7), days })
}

export async function familyOrders(c) {
  const cal = await loadCal(c.db)
  const from = c.url.searchParams.get('from') || addDays(c.today, -60)
  const to = c.url.searchParams.get('to') || cal.school.year_end || '9999-12-31'
  if (!isValidDate(from)) throw bad('from', 'Choose a start date.')
  if (!isValidDate(to)) throw bad('to', 'Choose an end date.')
  const { results } = await c.db.prepare(`${LINE_SELECT} WHERE l.family_id = ? AND l.date BETWEEN ? AND ? ${LINE_ORDER}`)
    .bind(c.family.id, from, to).all()
  return json({ lines: results.map((r) => lineOut(r, cal, c.now)) })
}

export async function familyLedger(c) {
  const { results } = await c.db.prepare('SELECT * FROM entries WHERE family_id = ? ORDER BY seq DESC').bind(c.family.id).all()
  const entries = results.map(entryOut)
  return json({ balance_cents: entries.reduce((s, e) => (e.voided ? s : s + e.amount_cents), 0), entries })
}
