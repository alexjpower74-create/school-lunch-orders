// Kitchen day totals and labels (docs/API.md "Kitchen"). Only active lines count; conflicts use allergies as they are now.
import { acknowledged, conflicts, flagOf } from './allergens.js'
import { cutoffAt, cutoffLabel, isPastCutoff, nextSchoolDay, noSchoolInfo, staffStatus } from './calendar.js'
import { loadCal } from './db.js'
import { bad, json } from './http.js'
import { dateLabel, isValidDate, longLabel } from './time.js'
import { parseList } from './text.js'

export function staffDate(c, cal, fallback) {
  const q = c.url.searchParams.get('date')
  if (q === null || q === '') return fallback
  if (!isValidDate(q)) throw bad('date', 'Choose a date.')
  return q
}

const kitchenDefault = (c, cal) => nextSchoolDay(cal, c.today) ?? c.today

// Every active line that day with what the kitchen needs to see.
export async function activeLinesFor(db, date) {
  const { results } = await db.prepare(`SELECT l.id AS line_id, l.child_id, l.item_id, l.qty, l.ack_allergens, i.name AS item_name,
    i.allergens AS item_allergens, ch.first_name, ch.class_id, ch.allergies, c.name AS class_name, c.grade, c.sort AS class_sort
    FROM lines l JOIN items i ON i.id = l.item_id JOIN children ch ON ch.id = l.child_id LEFT JOIN classes c ON c.id = ch.class_id
    WHERE l.date = ? AND l.status = 'active'`).bind(date).all()
  return results.map((r) => {
    const allergies = parseList(r.allergies)
    const cs = conflicts(parseList(r.item_allergens), allergies)
    return { ...r, class_sort: r.class_sort ?? 999, class_name: r.class_name ?? '', grade: r.grade ?? '', allergies, conflicts: cs,
      acknowledged: acknowledged(cs, parseList(r.ack_allergens)) }
  })
}

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const FLAG_RANK = { conflict: 0, allergy: 1 }

export async function kitchenDay(c) {
  const cal = await loadCal(c.db)
  const date = staffDate(c, cal, kitchenDefault(c, cal))
  const st = staffStatus(cal, date)
  const schoolDay = st.status === 'school_day'
  const at = schoolDay ? cutoffAt(cal, date) : null
  const rows = await activeLinesFor(c.db, date)
  const { results: menuRows } = schoolDay
    ? await c.db.prepare(`SELECT i.* FROM menu m JOIN items i ON i.id = m.item_id WHERE m.date = ? ORDER BY i.seq`).bind(date).all()
    : { results: [] }

  const items = new Map(menuRows.map((i) => [i.id, { item_id: i.id, name: i.name, qty: 0, allergens: parseList(i.allergens), vegetarian: !!i.vegetarian }]))
  const itemRows = rows.length
    ? (await c.db.prepare('SELECT * FROM items').all()).results
    : []
  const itemById = new Map(itemRows.map((i) => [i.id, i]))
  let item_count = 0
  const classes = new Map()
  const children = new Map()
  for (const r of rows) {
    item_count += r.qty
    if (!items.has(r.item_id)) {
      const i = itemById.get(r.item_id)
      items.set(r.item_id, { item_id: i.id, name: i.name, qty: 0, allergens: parseList(i.allergens), vegetarian: !!i.vegetarian })
    }
    items.get(r.item_id).qty += r.qty

    if (!classes.has(r.class_id)) {
      classes.set(r.class_id, { class_id: r.class_id, name: r.class_name, grade: r.grade, sort: r.class_sort, kids: new Set(), qty: 0, items: new Map() })
    }
    const cl = classes.get(r.class_id)
    cl.kids.add(r.child_id)
    cl.qty += r.qty
    cl.items.set(r.item_id, { item_id: r.item_id, name: r.item_name, qty: (cl.items.get(r.item_id)?.qty || 0) + r.qty })

    if (!children.has(r.child_id)) {
      children.set(r.child_id, { child_id: r.child_id, first_name: r.first_name, class_id: r.class_id, class_name: r.class_name, grade: r.grade,
        flag: null, allergies: r.allergies, lines: [], sort: r.class_sort })
    }
    children.get(r.child_id).lines.push({ line_id: r.line_id, item_id: r.item_id, item_name: r.item_name, qty: r.qty, conflicts: r.conflicts,
      acknowledged: r.acknowledged })
  }
  const itemSort = (a, b) => b.qty - a.qty || byName(a.name, b.name)
  const childList = [...children.values()].map((ch) => {
    ch.lines.sort((a, b) => byName(a.item_name, b.item_name))
    ch.flag = flagOf(ch.allergies, ch.lines.map((l) => l.conflicts))
    return ch
  }).sort((a, b) => (FLAG_RANK[a.flag] ?? 2) - (FLAG_RANK[b.flag] ?? 2) || a.sort - b.sort || byName(a.first_name, b.first_name))
    .map(({ sort, ...ch }) => ch)

  return json({
    date, date_label: dateLabel(date), long_label: longLabel(date), today: c.today, is_today: date === c.today,
    status: st.status, status_label: st.status_label, no_school: noSchoolInfo(cal, date),
    cutoff_at: at ? at.toISOString() : null, cutoff_label: at ? cutoffLabel(cal, date, at, c.now) : null,
    orders_open: schoolDay && !isPastCutoff(at, c.now),
    totals: { item_count, line_count: rows.length, children: children.size },
    items: [...items.values()].sort(itemSort),
    classes: [...classes.values()].filter((cl) => cl.qty >= 1).sort((a, b) => a.sort - b.sort || byName(a.name, b.name))
      .map((cl) => ({ class_id: cl.class_id, name: cl.name, grade: cl.grade, sort: cl.sort, children: cl.kids.size, qty: cl.qty,
        items: [...cl.items.values()].sort(itemSort) })),
    children: childList,
  })
}

export async function kitchenLabels(c) {
  const cal = await loadCal(c.db)
  const date = staffDate(c, cal, kitchenDefault(c, cal))
  const rows = await activeLinesFor(c.db, date)
  rows.sort((a, b) => a.class_sort - b.class_sort || byName(a.first_name, b.first_name) || byName(a.item_name, b.item_name))
  return json({
    date, date_label: dateLabel(date), school_name: cal.school.school_name, sample: cal.school.sample,
    labels: rows.map((r) => ({ line_id: r.line_id, first_name: r.first_name, class_name: r.class_name, grade: r.grade, item_name: r.item_name,
      qty: r.qty, conflicts: r.conflicts, allergies: r.allergies, acknowledged: r.acknowledged })),
  })
}
