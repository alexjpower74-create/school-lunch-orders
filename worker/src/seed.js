// The SAMPLE seed (docs/API.md "SAMPLE seed", exact; tests rely on it) and the wipe behind POST /api/test/reset.
import { codeHash, hashPin, randomSaltHex } from './auth.js'
import { isSchoolDay, makeCal, weekday } from './calendar.js'
import { insertMany } from './db.js'
import { addDays } from './time.js'

export const SAMPLE_SCHOOL = {
  school_name: 'SAMPLE Harbour Pond Elementary (demo)',
  sample: true,
  cutoff_days_before: 1,
  cutoff_time: '09:00',
  year_start: '2026-09-08',
  year_end: '2027-06-25',
  payment_instructions:
    'Pay by Interac e-Transfer to lunch-orders@example.org (SAMPLE address) and put your family code in the message. ' +
    "Or send cash in a sealed envelope marked with your child's name and room.",
}

export const CLASSES = [
  ['room-k', 'Room 1', 'Kindergarten', 0],
  ['room-1', 'Room 2', 'Grade 1', 1],
  ['room-2', 'Room 4', 'Grade 2', 2],
  ['room-3', 'Room 5', 'Grade 3', 3],
  ['room-4', 'Room 7', 'Grade 4', 4],
  ['room-5', 'Room 8', 'Grade 5', 5],
  ['room-6', 'Room 9', 'Grade 6', 6],
].map(([id, name, grade, sort]) => ({ id, name, grade, sort }))

export const STAFF = [
  { id: 'st-office', name: 'Ms. Janes (SAMPLE)', role: 'admin', pin: '3141', class_id: null },
  { id: 'st-kitchen', name: 'Mr. Kean (SAMPLE)', role: 'kitchen', pin: '2718', class_id: null },
  { id: 'st-oldford', name: 'Ms. Oldford (SAMPLE)', role: 'teacher', pin: '1618', class_id: 'room-2' },
  { id: 'st-pardy', name: 'Mr. Pardy (SAMPLE)', role: 'teacher', pin: '1414', class_id: 'room-5' },
]

const W = ['wheat_triticale', 'gluten']
export const ITEMS = [
  ['pizza', 'Cheese pizza slice', 350, [...W, 'milk'], true, [5], 2, 'Wheat flour crust, tomato sauce, mozzarella cheese'],
  ['fishcakes', 'Fish cakes and potatoes', 500, ['fish', 'eggs', ...W], false, [5], 1, 'Cod, potatoes, egg, breadcrumbs (wheat), onion'],
  [
    'soup',
    'Chicken noodle soup and a roll',
    425,
    ['eggs', ...W],
    false,
    [1, 3],
    1,
    'Chicken, egg noodles (wheat, egg), carrots, celery, wheat roll',
  ],
  [
    'wrap',
    'Turkey and cheese wrap',
    450,
    [...W, 'milk', 'mustard'],
    false,
    [1, 3],
    1,
    'Wheat tortilla, turkey, cheddar cheese, lettuce, mustard',
  ],
  [
    'stirfry',
    'Vegetable stir-fry with rice',
    450,
    ['soy', 'sesame'],
    true,
    [3],
    1,
    'Broccoli, carrots, peppers, tofu (soy), rice, sesame oil, gluten-free tamari (soy)',
  ],
  ['chili', 'Beef chili with rice', 475, [], false, [2, 4], 1, 'Ground beef, kidney beans, tomatoes, onion, peppers, spices, rice'],
  ['mac', 'Macaroni and cheese', 400, [...W, 'milk'], true, [2, 4], 1, 'Wheat macaroni, milk, cheddar cheese, butter'],
  ['milk', 'White milk (250 mL)', 100, ['milk'], true, [1, 2, 3, 4, 5], 2, 'Partly skimmed milk'],
  ['apple', 'Apple slices', 125, [], true, [1, 2, 3, 4, 5], 2, 'Apples'],
  [
    'cookie',
    'Oatmeal raisin cookie',
    100,
    ['eggs', 'milk', ...W],
    true,
    [1, 2, 3, 4, 5],
    1,
    'Oats, wheat flour, butter, egg, raisins, brown sugar',
  ],
].map(([id, name, price_cents, allergens, vegetarian, days, max_per_child, ingredients]) => ({
  id,
  name,
  price_cents,
  allergens,
  vegetarian,
  days,
  max_per_child,
  ingredients,
  active: true,
}))

export const NO_SCHOOL = [
  { date: '2026-10-12', kind: 'holiday', note: 'Thanksgiving Day' },
  { date: '2026-10-23', kind: 'pd_day', note: 'Professional development day' },
  { date: '2026-11-11', kind: 'holiday', note: 'Remembrance Day' },
]

export const FAMILIES = [
  {
    id: 'fam-1',
    label: 'Liam and Ava (SAMPLE)',
    code: 'KQ7M-4RTX',
    children: [
      { id: 'ch-liam', first_name: 'Liam', class_id: 'room-2', allergies: ['milk'] },
      { id: 'ch-ava', first_name: 'Ava', class_id: 'room-5', allergies: [] },
    ],
  },
  {
    id: 'fam-2',
    label: 'Noah (SAMPLE)',
    code: 'W3PH-8JND',
    children: [{ id: 'ch-noah', first_name: 'Noah', class_id: 'room-k', allergies: ['peanuts', 'tree_nuts'] }],
  },
  {
    id: 'fam-3',
    label: 'Emma, Jack and Chloe (SAMPLE)',
    code: 'C9VB-6FYE',
    children: [
      { id: 'ch-emma', first_name: 'Emma', class_id: 'room-6', allergies: ['gluten'] },
      { id: 'ch-jack', first_name: 'Jack', class_id: 'room-2', allergies: [] },
      { id: 'ch-chloe', first_name: 'Chloe', class_id: 'room-1', allergies: ['eggs', 'sesame'] },
    ],
  },
  {
    id: 'fam-4',
    label: 'Owen (SAMPLE)',
    code: 'T5ZA-2GUK',
    children: [{ id: 'ch-owen', first_name: 'Owen', class_id: 'room-4', allergies: [] }],
  },
]

// Children before families, lines before orders: the wipe order.
export const TABLES = [
  'sessions',
  'pin_attempts',
  'code_attempts',
  'deliveries',
  'entries',
  'lines',
  'orders',
  'menu',
  'no_school',
  'children',
  'families',
  'staff',
  'items',
  'classes',
  'school',
]

// PBKDF2 at 100 000 iterations is slow on purpose; the SAMPLE PINs are hashed once per isolate, not on every reset.
const pinCache = new Map()
async function samplePin(pin) {
  if (!pinCache.has(pin)) {
    const salt = randomSaltHex()
    pinCache.set(pin, { salt, hash: await hashPin(pin, salt) })
  }
  return pinCache.get(pin)
}

/** The seeded menu's last day: the later of 2026-12-18 and today + 56 days, never past year_end. */
export function menuEnd(today) {
  const later = addDays(today, 56) > '2026-12-18' ? addDays(today, 56) : '2026-12-18'
  return later > SAMPLE_SCHOOL.year_end ? SAMPLE_SCHOOL.year_end : later
}

export async function resetDb(db, now, today) {
  const nowIso = now.toISOString()
  const stmts = TABLES.map((t) => db.prepare(`DELETE FROM ${t}`))
  const s = SAMPLE_SCHOOL
  stmts.push(
    db
      .prepare(`INSERT INTO school (id, school_name, sample, payment_instructions, cutoff_days_before, cutoff_time, year_start,
    year_end) VALUES (1, ?, 1, ?, ?, ?, ?, ?)`)
      .bind(s.school_name, s.payment_instructions, s.cutoff_days_before, s.cutoff_time, s.year_start, s.year_end),
  )
  stmts.push(
    ...insertMany(
      db,
      'classes',
      ['id', 'name', 'grade', 'sort'],
      CLASSES.map((c) => [c.id, c.name, c.grade, c.sort]),
    ),
  )
  const staffRows = []
  for (const st of STAFF) {
    const p = await samplePin(st.pin)
    staffRows.push([st.id, st.name, st.role, p.hash, p.salt, st.class_id, 1])
  }
  stmts.push(...insertMany(db, 'staff', ['id', 'name', 'role', 'pin_hash', 'pin_salt', 'class_id', 'active'], staffRows))
  stmts.push(
    ...ITEMS.map((i) =>
      db
        .prepare(`INSERT INTO items (id, name, price_cents, ingredients, allergens, vegetarian, days,
    max_per_child, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)
        .bind(
          i.id,
          i.name,
          i.price_cents,
          i.ingredients,
          JSON.stringify(i.allergens),
          i.vegetarian ? 1 : 0,
          JSON.stringify(i.days),
          i.max_per_child,
        ),
    ),
  )
  stmts.push(
    ...insertMany(
      db,
      'no_school',
      ['date', 'kind', 'note', 'created_at'],
      NO_SCHOOL.map((n) => [n.date, n.kind, n.note, nowIso]),
    ),
  )
  const famRows = []
  const childRows = []
  for (const f of FAMILIES) {
    famRows.push([f.id, f.label, await codeHash(f.code), nowIso])
    for (const ch of f.children) childRows.push([ch.id, f.id, ch.first_name, ch.class_id, JSON.stringify(ch.allergies), nowIso])
  }
  stmts.push(...insertMany(db, 'families', ['id', 'label', 'code_hash', 'created_at'], famRows))
  stmts.push(...insertMany(db, 'children', ['id', 'family_id', 'first_name', 'class_id', 'allergies', 'created_at'], childRows))

  const cal = makeCal(s, NO_SCHOOL)
  const menuRows = []
  const end = menuEnd(today)
  for (let d = s.year_start; d <= end; d = addDays(d, 1)) {
    if (!isSchoolDay(cal, d)) continue
    for (const i of ITEMS) if (i.days.includes(weekday(d))) menuRows.push([d, i.id])
  }
  stmts.push(...insertMany(db, 'menu', ['date', 'item_id'], menuRows))
  await db.batch(stmts)
}
