// /api/test/* (only with TEST_MODE=1; the router answers 404 otherwise). Reset loads the SAMPLE seed; seed adds the demo.
import { json } from './http.js'
import { readJson } from './db.js'
import { seedDemo } from './demo.js'
import { resetDb } from './seed.js'

export async function testReset(c) {
  await resetDb(c.db, c.now, c.today)
  return json({ ok: true, today: c.today })
}

export async function testSeed(c) {
  const body = await readJson(c)
  if (body.scenario !== 'demo') return json({ error: 'Only the demo scenario exists.', code: 'bad_request', field: 'scenario' }, 400)
  await resetDb(c.db, c.now, c.today)
  const families = await seedDemo(c)
  return json({ ok: true, today: c.today, families })
}
