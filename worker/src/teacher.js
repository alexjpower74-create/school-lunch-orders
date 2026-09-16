// A class's lunch list for a day and marking lunches given out / absent (docs/API.md "Teacher"). Absent never credits.
import { conflicts, flagOf } from './allergens.js'
import { noSchoolInfo, staffStatus } from './calendar.js'
import { classOut, loadCal, readJson } from './db.js'
import { bad, conflict, json, notFound } from './http.js'
import { staffDate } from './kitchen.js'
import { dateLabel, isValidDate } from './time.js'
import { parseList } from './text.js'

const STATE_LABELS = { delivered: 'Given out', absent: 'Absent' }

async function myClassId(c) {
  const { results } = await c.db.prepare('SELECT * FROM classes ORDER BY sort, name').all()
  const mine = c.staff.class_id && results.some((r) => r.id === c.staff.class_id) ? c.staff.class_id : (results[0]?.id ?? null)
  return { classes: results, mine }
}

export async function teacherClasses(c) {
  const { classes, mine } = await myClassId(c)
  return json({ classes: classes.map(classOut), my_class_id: mine })
}

// The rows of one class on a date: children with at least one active line, by first name.
async function classRows(db, classId, date) {
  const { results } = await db
    .prepare(`SELECT l.id AS line_id, l.child_id, l.qty, i.name AS item_name, i.allergens AS item_allergens,
    ch.first_name, ch.allergies, d.state FROM lines l JOIN children ch ON ch.id = l.child_id JOIN items i ON i.id = l.item_id
    LEFT JOIN deliveries d ON d.date = l.date AND d.child_id = l.child_id
    WHERE l.date = ? AND l.status = 'active' AND ch.class_id = ? ORDER BY ch.first_name, i.name`)
    .bind(date, classId)
    .all()
  const kids = new Map()
  for (const r of results) {
    const allergies = parseList(r.allergies)
    if (!kids.has(r.child_id)) {
      kids.set(r.child_id, {
        child_id: r.child_id,
        first_name: r.first_name,
        allergies,
        flag: null,
        state: r.state || null,
        state_label: STATE_LABELS[r.state] || 'Waiting',
        lines: [],
      })
    }
    kids
      .get(r.child_id)
      .lines.push({ line_id: r.line_id, item_name: r.item_name, qty: r.qty, conflicts: conflicts(parseList(r.item_allergens), allergies) })
  }
  const children = [...kids.values()].sort((a, b) => (a.first_name < b.first_name ? -1 : a.first_name > b.first_name ? 1 : 0))
  for (const ch of children)
    ch.flag = flagOf(
      ch.allergies,
      ch.lines.map((l) => l.conflicts),
    )
  const counts = {
    children: children.length,
    delivered: children.filter((k) => k.state === 'delivered').length,
    absent: children.filter((k) => k.state === 'absent').length,
  }
  counts.waiting = counts.children - counts.delivered - counts.absent
  return { children, counts }
}

export async function teacherDay(c) {
  const cal = await loadCal(c.db)
  const { classes, mine } = await myClassId(c)
  const classId = c.url.searchParams.get('class_id') || mine
  const cls = classes.find((r) => r.id === classId)
  if (!cls) throw notFound("That class isn't on the school's list.")
  const date = staffDate(c, cal, c.today)
  const st = staffStatus(cal, date)
  const { children, counts } = await classRows(c.db, cls.id, date)
  return json({
    date,
    date_label: dateLabel(date),
    is_today: date === c.today,
    status: st.status,
    status_label: st.status_label,
    no_school: noSchoolInfo(cal, date),
    class: classOut(cls),
    children,
    counts,
  })
}

export async function teacherMark(c) {
  const body = await readJson(c)
  if (!isValidDate(body.date)) throw bad('date', 'Choose a date.')
  if (!(body.state === null || body.state === 'delivered' || body.state === 'absent')) throw bad('state', 'Choose Given out or Absent.')
  if (typeof body.child_id !== 'string') throw bad('child_id', 'Choose a child.')
  const child = await c.db.prepare('SELECT id, first_name, class_id FROM children WHERE id = ?').bind(body.child_id).first()
  if (!child) throw notFound("That child isn't on the list.")
  if (body.date !== c.today) throw conflict('bad_state', "You can only mark today's lunches.")
  const has = await c.db
    .prepare("SELECT COUNT(*) AS n FROM lines WHERE child_id = ? AND date = ? AND status = 'active'")
    .bind(child.id, body.date)
    .first()
  if (!has.n) throw conflict('bad_state', `${child.first_name} has no lunch ordered today.`)
  if (body.state === null) {
    await c.db.prepare('DELETE FROM deliveries WHERE date = ? AND child_id = ?').bind(body.date, child.id).run()
  } else {
    await c.db
      .prepare(`INSERT INTO deliveries (date, child_id, state, staff_id, at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (date, child_id) DO UPDATE SET state = excluded.state, staff_id = excluded.staff_id, at = excluded.at`)
      .bind(body.date, child.id, body.state, c.staff.id, c.nowIso)
      .run()
  }
  const { children, counts } = await classRows(c.db, child.class_id, body.date)
  return json({ child: children.find((k) => k.child_id === child.id), counts })
}
