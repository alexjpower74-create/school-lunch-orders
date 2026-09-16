// Reading shared rows (the school, the calendar) and shaping them for JSON; request-body helpers.
import { cleanAllergenList } from './allergens.js'
import { DEFAULT_SCHOOL, makeCal } from './calendar.js'
import { bad } from './http.js'
import { parseList } from './text.js'

export function schoolOut(row) {
  if (!row) return { ...DEFAULT_SCHOOL }
  return {
    school_name: row.school_name,
    sample: !!row.sample,
    payment_instructions: row.payment_instructions,
    cutoff_days_before: row.cutoff_days_before,
    cutoff_time: row.cutoff_time,
    year_start: row.year_start,
    year_end: row.year_end,
  }
}

export async function loadCal(db) {
  const [s, n] = await db.batch([
    db.prepare('SELECT * FROM school WHERE id = 1'),
    db.prepare('SELECT date, kind, note FROM no_school ORDER BY date'),
  ])
  return makeCal(schoolOut(s.results[0]), n.results)
}

export const classOut = (r) => ({ id: r.id, name: r.name, grade: r.grade, sort: r.sort })

// Rows from CHILD_SELECT.
export const CHILD_SELECT = `SELECT ch.id, ch.family_id, ch.first_name, ch.class_id, ch.allergies, ch.removed, c.name AS class_name,
  c.grade FROM children ch LEFT JOIN classes c ON c.id = ch.class_id`
export const childOut = (r) => ({
  id: r.id,
  first_name: r.first_name,
  class_id: r.class_id,
  class_name: r.class_name ?? '',
  grade: r.grade ?? '',
  allergies: cleanAllergenList(parseList(r.allergies)) || [],
})

export const menuItemOut = (r) => ({
  id: r.id,
  name: r.name,
  price_cents: r.price_cents,
  ingredients: r.ingredients,
  allergens: parseList(r.allergens),
  vegetarian: !!r.vegetarian,
  max_per_child: r.max_per_child ?? null,
})
export const itemOut = (r) => ({ ...menuItemOut(r), days: parseList(r.days), active: !!r.active })

export const staffOut = (r) => ({ id: r.id, name: r.name, role: r.role, class_id: r.class_id ?? null, active: !!r.active })

export async function readJson(c) {
  if (c.body !== undefined) return c.body
  let v
  try {
    v = await c.request.json()
  } catch {
    v = null
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad('body', 'Something was missing from the request. Try again.')
  c.body = v
  return v
}

const chars = (s) => [...s].length

/** A trimmed string of min..max characters, or a 400 on that field. A missing optional (min 0) field is "". */
export function textField(body, field, min, max, message) {
  const v = body[field]
  if ((v === undefined || v === null) && min === 0) return ''
  if (typeof v !== 'string') throw bad(field, message)
  const t = v.trim()
  if (chars(t) < min || chars(t) > max) throw bad(field, message)
  return t
}

export function intField(body, field, min, max, message) {
  const v = body[field]
  if (!Number.isInteger(v) || v < min || v > max) throw bad(field, message)
  return v
}

export function boolField(body, field, message) {
  if (typeof body[field] !== 'boolean') throw bad(field, message)
  return body[field]
}

/** Batch INSERT rows in chunks so no statement binds more than 100 values (D1's limit). */
export function insertMany(db, table, columns, rows) {
  const per = Math.max(1, Math.floor(90 / columns.length))
  const out = []
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    const marks = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')
    out.push(db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${marks}`).bind(...chunk.flat()))
  }
  return out
}
