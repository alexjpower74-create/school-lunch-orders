// Settings: the school, items, the menu calendar, no-school days (which cancel and credit that day's orders), classes and
// staff PINs (docs/API.md "Settings").
import { ALLERGENS, cleanAllergenList } from './allergens.js'
import { PIN_RE, hashPin, randomId, randomSaltHex, staffByPin } from './auth.js'
import { KINDS, KIND_LABELS, inYear, isSchoolDay, isWeekday, noSchoolInfo, staffStatus, weekLabel, weekStart, weekday } from './calendar.js'
import { boolField, classOut, intField, itemOut, loadCal, readJson, schoolOut, staffOut, textField } from './db.js'
import { bad, conflict, json, notFound } from './http.js'
import { closureLabel, insertEntry } from './ledger.js'
import { addDays, dateLabel, isValidDate } from './time.js'
import { parseList } from './text.js'

// ---------- settings and the school ----------

export async function getSettings(c) {
  const [s, cl, st, it, ns] = await c.db.batch([
    c.db.prepare('SELECT * FROM school WHERE id = 1'),
    c.db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM children ch WHERE ch.class_id = c.id AND ch.removed = 0) AS child_count
      FROM classes c ORDER BY c.sort, c.name`),
    c.db.prepare('SELECT * FROM staff ORDER BY name'),
    c.db.prepare('SELECT * FROM items ORDER BY seq'),
    c.db.prepare('SELECT * FROM no_school ORDER BY date'),
  ])
  return json({
    school: schoolOut(s.results[0]),
    classes: cl.results.map((r) => ({ ...classOut(r), child_count: r.child_count })),
    staff: st.results.map(staffOut),
    items: it.results.map(itemOut),
    no_school_days: ns.results.map((r) => ({ date: r.date, date_label: dateLabel(r.date), kind: r.kind, kind_label: KIND_LABELS[r.kind], note: r.note })),
    allergens: ALLERGENS,
  })
}

export async function putSchool(c) {
  const body = await readJson(c)
  const school_name = textField(body, 'school_name', 1, 80, 'Type the school name (up to 80 characters).')
  const payment_instructions = textField(body, 'payment_instructions', 1, 600, 'Type how families pay (up to 600 characters).')
  const cutoff_days_before = intField(body, 'cutoff_days_before', 0, 5, 'Choose 0 to 5 school days before.')
  if (typeof body.cutoff_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.cutoff_time)) throw bad('cutoff_time', 'Choose a time like 09:00.')
  if (!isValidDate(body.year_start)) throw bad('year_start', 'Choose the first day of the school year.')
  if (!isValidDate(body.year_end) || body.year_end <= body.year_start) throw bad('year_end', 'Choose a last day after the first day.')
  const cur = await c.db.prepare('SELECT sample FROM school WHERE id = 1').first()
  await c.db.prepare(`INSERT INTO school (id, school_name, sample, payment_instructions, cutoff_days_before, cutoff_time, year_start, year_end)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET school_name = excluded.school_name,
    payment_instructions = excluded.payment_instructions, cutoff_days_before = excluded.cutoff_days_before,
    cutoff_time = excluded.cutoff_time, year_start = excluded.year_start, year_end = excluded.year_end`)
    .bind(school_name, cur?.sample ? 1 : 0, payment_instructions, cutoff_days_before, body.cutoff_time, body.year_start, body.year_end).run()
  return json({ school: schoolOut(await c.db.prepare('SELECT * FROM school WHERE id = 1').first()) })
}

// ---------- items ----------

function itemInput(body) {
  const name = textField(body, 'name', 1, 60, 'Type the item name (up to 60 characters).')
  const price_cents = intField(body, 'price_cents', 0, 5000, 'Type a price from $0.00 to $50.00.')
  const ingredients = textField(body, 'ingredients', 0, 400, 'Keep the ingredients under 400 characters.')
  const allergens = cleanAllergenList(body.allergens)
  if (!allergens) throw bad('allergens', 'Tick allergens from the list.')
  const vegetarian = boolField(body, 'vegetarian', 'Say whether it is vegetarian.')
  const days = body.days
  if (!Array.isArray(days) || days.some((d) => !Number.isInteger(d) || d < 1 || d > 5) || new Set(days).size !== days.length) {
    throw bad('days', 'Tick the usual days (Monday to Friday).')
  }
  const max = body.max_per_child
  if (!(max === null || max === undefined || (Number.isInteger(max) && max >= 1 && max <= 10))) {
    throw bad('max_per_child', 'Choose a daily limit from 1 to 10, or leave it empty.')
  }
  const active = boolField(body, 'active', 'Say whether the item is on offer.')
  return { name, price_cents, ingredients, allergens, vegetarian, days: [...days].sort(), max_per_child: max ?? null, active }
}

const itemBinds = (i) => [i.name, i.price_cents, i.ingredients, JSON.stringify(i.allergens), i.vegetarian ? 1 : 0, JSON.stringify(i.days),
  i.max_per_child, i.active ? 1 : 0]

export async function addItem(c) {
  const i = itemInput(await readJson(c))
  const id = randomId('item')
  await c.db.prepare(`INSERT INTO items (name, price_cents, ingredients, allergens, vegetarian, days, max_per_child, active, id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...itemBinds(i), id).run()
  return json({ item: itemOut(await c.db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first()) }, 201)
}

export async function putItem(c, { id }) {
  const old = await c.db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first()
  if (!old) throw notFound("That item isn't on the list.")
  const i = itemInput(await readJson(c))
  const stmts = [c.db.prepare(`UPDATE items SET name = ?, price_cents = ?, ingredients = ?, allergens = ?, vegetarian = ?, days = ?,
    max_per_child = ?, active = ? WHERE id = ?`).bind(...itemBinds(i), id)]
  if (!i.active) {
    const r = await c.db.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM lines WHERE item_id = ? AND status = 'active' AND date >= ?")
      .bind(id, c.today).first()
    if (r.q > 0) {
      throw conflict('bad_state', `${r.q} of ${old.name} ${r.q === 1 ? 'is' : 'are'} ordered for days still to come. Leave it on until those days pass.`)
    }
    stmts.push(c.db.prepare('DELETE FROM menu WHERE item_id = ? AND date >= ?').bind(id, c.today))
  }
  await c.db.batch(stmts)
  return json({ item: itemOut(await c.db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first()) })
}

// ---------- menu calendar ----------

async function menuDays(db, cal, dates) {
  const [m, o] = await db.batch([
    db.prepare('SELECT m.date, m.item_id FROM menu m JOIN items i ON i.id = m.item_id WHERE m.date BETWEEN ? AND ? ORDER BY i.seq')
      .bind(dates[0], dates[dates.length - 1]),
    db.prepare(`SELECT date, item_id, SUM(qty) AS qty FROM lines WHERE status = 'active' AND date BETWEEN ? AND ? GROUP BY date, item_id`)
      .bind(dates[0], dates[dates.length - 1]),
  ])
  return dates.map((date) => {
    const st = staffStatus(cal, date)
    const ordered = {}
    for (const r of o.results) if (r.date === date) ordered[r.item_id] = r.qty
    return { date, date_label: dateLabel(date), status: st.status, status_label: st.status_label, no_school: noSchoolInfo(cal, date),
      item_ids: m.results.filter((r) => r.date === date).map((r) => r.item_id), ordered }
  })
}

async function menuWeek(c, cal, anyDate) {
  const monday = weekStart(anyDate)
  const dates = [0, 1, 2, 3, 4].map((i) => addDays(monday, i))
  return { week_start: monday, week_label: weekLabel(monday), prev_week: addDays(monday, -7), next_week: addDays(monday, 7),
    days: await menuDays(c.db, cal, dates) }
}

export async function getMenu(c) {
  const cal = await loadCal(c.db)
  const q = c.url.searchParams.get('week')
  if (q && !isValidDate(q)) throw bad('week', 'Choose a week.')
  return json(await menuWeek(c, cal, q || c.today))
}

export async function putMenuDay(c, { date }) {
  const cal = await loadCal(c.db)
  if (!isValidDate(date)) throw bad('date', 'Choose a date.')
  if (!isSchoolDay(cal, date)) throw bad('date', `${dateLabel(date)} is not a school day.`)
  const body = await readJson(c)
  const ids = body.item_ids
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string') || new Set(ids).size !== ids.length) throw bad('item_ids', 'Tick items from the list.')
  const { results: active } = await c.db.prepare('SELECT id, name FROM items WHERE active = 1').all()
  const activeIds = new Set(active.map((i) => i.id))
  if (ids.some((x) => !activeIds.has(x))) throw bad('item_ids', 'Only items on offer can go on the menu.')
  if (date < c.today) throw conflict('bad_state', 'That day has passed.')
  const { results: ordered } = await c.db.prepare(`SELECT l.item_id, i.name, SUM(l.qty) AS qty FROM lines l JOIN items i ON i.id = l.item_id
    WHERE l.date = ? AND l.status = 'active' GROUP BY l.item_id, i.name ORDER BY i.seq`).bind(date).all()
  const left = ordered.find((r) => !ids.includes(r.item_id))
  if (left) {
    throw conflict('bad_state', `${left.qty} of ${left.name} ${left.qty === 1 ? 'is' : 'are'} already ordered for ${dateLabel(date)}. ` +
      'Keep it on the menu, or make the day a no-school day.')
  }
  await c.db.batch([
    c.db.prepare('DELETE FROM menu WHERE date = ?').bind(date),
    ...ids.map((id) => c.db.prepare('INSERT INTO menu (date, item_id) VALUES (?, ?)').bind(date, id)),
  ])
  return json({ day: (await menuDays(c.db, cal, [date]))[0] })
}

export async function fillMenuWeek(c) {
  const body = await readJson(c)
  if (!isValidDate(body.week)) throw bad('week', 'Choose a week.')
  const cal = await loadCal(c.db)
  const monday = weekStart(body.week)
  const dates = [0, 1, 2, 3, 4].map((i) => addDays(monday, i)).filter((d) => d >= c.today && isSchoolDay(cal, d))
  if (dates.length) {
    const [m, it] = await c.db.batch([
      c.db.prepare('SELECT DISTINCT date FROM menu WHERE date BETWEEN ? AND ?').bind(dates[0], dates[dates.length - 1]),
      c.db.prepare('SELECT id, days FROM items WHERE active = 1 ORDER BY seq'),
    ])
    const hasMenu = new Set(m.results.map((r) => r.date))
    const stmts = []
    for (const d of dates) {
      if (hasMenu.has(d)) continue
      for (const i of it.results) {
        if (parseList(i.days).includes(weekday(d))) stmts.push(c.db.prepare('INSERT INTO menu (date, item_id) VALUES (?, ?)').bind(d, i.id))
      }
    }
    if (stmts.length) await c.db.batch(stmts)
  }
  return json(await menuWeek(c, cal, monday))
}

// ---------- no-school days ----------

// What closing a day cancels and credits: that day's active lines, summed per family from each line's own total.
async function closurePlan(db, date) {
  const { results } = await db.prepare(`SELECT id, family_id, qty, unit_price_cents, total_cents FROM lines
    WHERE date = ? AND status = 'active' ORDER BY family_id, seq`).bind(date).all()
  const credit = new Map()
  let item_count = 0
  for (const r of results) {
    credit.set(r.family_id, (credit.get(r.family_id) || 0) + r.total_cents)
    item_count += r.qty
  }
  const credit_cents = [...credit.values()].reduce((s, v) => s + v, 0)
  return { ids: results.map((r) => r.id), credit, summary: { lines: results.length, item_count, families: credit.size, credit_cents } }
}

export async function previewNoSchool(c) {
  const date = c.url.searchParams.get('date')
  if (!isValidDate(date)) throw bad('date', 'Choose a date.')
  const { summary } = await closurePlan(c.db, date)
  return json({ date, date_label: dateLabel(date), ...summary })
}

export async function addNoSchool(c) {
  const body = await readJson(c)
  const cal = await loadCal(c.db)
  const date = body.date
  if (!isValidDate(date) || !isWeekday(date)) throw bad('date', 'Choose a weekday.')
  if (date < c.today) throw bad('date', 'Choose today or a later day.')
  if (!inYear(cal, date)) throw bad('date', 'Choose a day inside the school year.')
  if (!KINDS.includes(body.kind)) throw bad('kind', 'Choose holiday, PD day or school closed.')
  const note = textField(body, 'note', 0, 120, 'Keep the note under 120 characters.')
  if (cal.noSchool.has(date)) throw conflict('bad_state', `${dateLabel(date)} is already a no-school day.`)
  const plan = await closurePlan(c.db, date)
  const stmts = [c.db.prepare('INSERT INTO no_school (date, kind, note, created_at) VALUES (?, ?, ?, ?)').bind(date, body.kind, note, c.nowIso)]
  // Close exactly the lines that were credited (chunks stay under D1's bound-value limit).
  for (let i = 0; i < plan.ids.length; i += 80) {
    const chunk = plan.ids.slice(i, i + 80)
    stmts.push(c.db.prepare(`UPDATE lines SET status = 'closed', changed_at = ? WHERE status = 'active' AND id IN (${chunk.map(() => '?').join(', ')})`)
      .bind(c.nowIso, ...chunk))
  }
  for (const [familyId, cents] of plan.credit) {
    stmts.push(insertEntry(c.db, { id: randomId('ent'), family_id: familyId, at: c.nowIso, kind: 'closure', amount_cents: -cents,
      label: closureLabel(body.kind, date), note }))
  }
  await c.db.batch(stmts)
  return json({ day: { date, date_label: dateLabel(date), kind: body.kind, kind_label: KIND_LABELS[body.kind], note }, cancelled: plan.summary }, 201)
}

export async function deleteNoSchool(c, { date }) {
  const row = isValidDate(date) ? await c.db.prepare('SELECT date FROM no_school WHERE date = ?').bind(date).first() : null
  if (!row) throw notFound("That day isn't on the no-school list.")
  if (date < c.today) throw conflict('bad_state', 'That day has passed.')
  await c.db.prepare('DELETE FROM no_school WHERE date = ?').bind(date).run()
  return json({ ok: true, restored_lines: 0 })
}

// ---------- classes ----------

function classInput(body) {
  return {
    name: textField(body, 'name', 1, 30, 'Type the class name (up to 30 characters).'),
    grade: textField(body, 'grade', 1, 30, 'Type the grade (up to 30 characters).'),
    sort: intField(body, 'sort', 0, 99, 'Choose a place in the list from 0 to 99.'),
  }
}

export async function addClass(c) {
  const k = classInput(await readJson(c))
  const id = randomId('class')
  await c.db.prepare('INSERT INTO classes (id, name, grade, sort) VALUES (?, ?, ?, ?)').bind(id, k.name, k.grade, k.sort).run()
  return json({ class: { id, ...k } }, 201)
}

export async function putClass(c, { id }) {
  if (!(await c.db.prepare('SELECT id FROM classes WHERE id = ?').bind(id).first())) throw notFound("That class isn't on the list.")
  const k = classInput(await readJson(c))
  await c.db.prepare('UPDATE classes SET name = ?, grade = ?, sort = ? WHERE id = ?').bind(k.name, k.grade, k.sort, id).run()
  return json({ class: { id, ...k } })
}

// ---------- staff ----------

const ROLES = ['admin', 'kitchen', 'teacher']

async function staffInput(c, body, { exceptId, pinRequired }) {
  const name = textField(body, 'name', 1, 60, 'Type the name (up to 60 characters).')
  if (!ROLES.includes(body.role)) throw bad('role', 'Choose office, kitchen or teacher.')
  let pin = null
  if (pinRequired || (body.pin !== undefined && body.pin !== null && body.pin !== '')) {
    if (typeof body.pin !== 'string' || !PIN_RE.test(body.pin)) throw bad('pin', 'Choose a PIN of 4 to 6 digits.')
    pin = body.pin
  }
  const class_id = body.class_id ?? null
  if (class_id !== null && (typeof class_id !== 'string' || !(await c.db.prepare('SELECT id FROM classes WHERE id = ?').bind(class_id).first()))) {
    throw bad('class_id', 'Choose a class from the list.')
  }
  if (pin && (await staffByPin(c.db, pin, { includeInactive: true, exceptId }))) {
    throw conflict('pin_taken', 'Someone else already has that PIN. Choose another.', { field: 'pin' })
  }
  return { name, role: body.role, pin, class_id }
}

export async function addStaff(c) {
  const s = await staffInput(c, await readJson(c), { exceptId: null, pinRequired: true })
  const id = randomId('st')
  const salt = randomSaltHex()
  await c.db.prepare('INSERT INTO staff (id, name, role, pin_hash, pin_salt, class_id, active) VALUES (?, ?, ?, ?, ?, ?, 1)')
    .bind(id, s.name, s.role, await hashPin(s.pin, salt), salt, s.class_id).run()
  return json({ staff: staffOut(await c.db.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first()) }, 201)
}

export async function putStaff(c, { id }) {
  const old = await c.db.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first()
  if (!old) throw notFound("That person isn't on the staff list.")
  const body = await readJson(c)
  const active = boolField(body, 'active', 'Say whether this PIN still works.')
  const s = await staffInput(c, body, { exceptId: id, pinRequired: false })
  if (!(s.role === 'admin' && active)) {
    const r = await c.db.prepare("SELECT COUNT(*) AS n FROM staff WHERE role = 'admin' AND active = 1 AND id != ?").bind(id).first()
    if (r.n === 0) throw conflict('bad_state', 'The school needs at least one office PIN.')
  }
  const stmts = [c.db.prepare('UPDATE staff SET name = ?, role = ?, class_id = ?, active = ? WHERE id = ?').bind(s.name, s.role, s.class_id, active ? 1 : 0, id)]
  if (s.pin) {
    const salt = randomSaltHex()
    stmts.push(c.db.prepare('UPDATE staff SET pin_hash = ?, pin_salt = ? WHERE id = ?').bind(await hashPin(s.pin, salt), salt, id))
  }
  if (!active || s.pin) stmts.push(c.db.prepare("DELETE FROM sessions WHERE kind = 'staff' AND subject_id = ?").bind(id))
  await c.db.batch(stmts)
  return json({ staff: staffOut(await c.db.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first()) })
}
