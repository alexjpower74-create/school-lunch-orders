// Info, sign-in, the rate guards, the role matrix, family isolation and children.
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { CODE, NOW, PIN, call, familyToken, get, order, reset, staffToken } from './client.mjs'

beforeEach(() => reset())

test('info after reset: the SAMPLE school, today and the next school day at the anchor', async () => {
  const r = await call('GET', '/api/info')
  assert.equal(r.status, 200)
  assert.equal(r.body.school_name, 'SAMPLE Harbour Pond Elementary (demo)')
  assert.equal(r.body.sample, true)
  assert.equal(r.body.today, '2026-09-15')
  assert.equal(r.body.date_label, 'Tue Sep 15')
  assert.equal(r.body.long_label, 'Tuesday, September 15')
  assert.equal(r.body.next_school_day, '2026-09-16')
  assert.equal(r.body.next_school_day_label, 'Wed Sep 16')
  assert.match(r.body.payment_instructions, /^Pay by Interac e-Transfer/)
  const late = await call('GET', '/api/info', { now: '2026-10-09T20:00:00Z' })
  assert.equal(late.body.next_school_day, '2026-10-13', 'over the weekend and Thanksgiving')
  assert.equal((await call('GET', '/api/nope')).status, 404)
})

test('family sign-in: the code typed lower case, without the dash or with spaces works; a wrong code is 401 on field code', async () => {
  for (const code of ['KQ7M-4RTX', 'kq7m-4rtx', 'kq7m4rtx', ' KQ7M 4RTX ']) {
    const r = await call('POST', '/api/family/signin', { body: { code } })
    assert.equal(r.status, 200, `${code}: ${r.text}`)
    assert.deepEqual(r.body.family, { id: 'fam-1', label: 'Liam and Ava (SAMPLE)' })
    assert.equal(r.body.token.length, 43)
    assert.equal(r.body.expires_at, '2026-12-14T13:30:00.000Z', '90 days')
  }
  const bad = await call('POST', '/api/family/signin', { body: { code: 'KQ7M-4RTY' } })
  assert.equal(bad.status, 401)
  assert.equal(bad.body.code, 'unauthorized')
  assert.equal(bad.body.field, 'code')
  assert.equal(bad.body.error, "That family code doesn't match. Check the paper from the school, or ask the office.")
  assert.equal((await call('POST', '/api/family/signin', { body: {} })).status, 401)
  assert.equal((await call('POST', '/api/family/signin', { body: { code: 'W3PH-8JND' } })).body.family.id, 'fam-2')
})

test('family sign-in rate limit: 10 wrong codes from one IP, then 429 even for the right code', async () => {
  const ip = 'rate-family'
  for (let i = 0; i < 10; i++) {
    const r = await call('POST', '/api/family/signin', { body: { code: `AAAA-AAA${'BCDEFGHJKM'[i]}` }, ip })
    assert.equal(r.status, 401, `wrong try ${i + 1}`)
  }
  const locked = await call('POST', '/api/family/signin', { body: { code: CODE['fam-1'] }, ip })
  assert.equal(locked.status, 429, locked.text)
  assert.equal(locked.body.code, 'rate_limited')
  assert.equal(locked.body.error, 'Too many tries. Wait 15 minutes, then try again.')
  assert.equal((await call('POST', '/api/family/signin', { body: { code: CODE['fam-1'] }, ip: 'another-ip' })).status, 200, 'other IPs are not locked')
  const later = await call('POST', '/api/family/signin', { body: { code: CODE['fam-1'] }, ip, now: '2026-09-15T13:45:01Z' })
  assert.equal(later.status, 200, 'the window has passed')
})

test('staff sign-in: each SAMPLE PIN gives its role; a wrong PIN is 401 on field pin; 5 wrong PINs → 429', async () => {
  const want = { admin: ['admin', 'st-office', null], kitchen: ['kitchen', 'st-kitchen', null], oldford: ['teacher', 'st-oldford', 'room-2'],
    pardy: ['teacher', 'st-pardy', 'room-5'] }
  for (const [who, [role, id, classId]] of Object.entries(want)) {
    const r = await call('POST', '/api/staff/signin', { body: { pin: PIN[who] } })
    assert.equal(r.status, 200, r.text)
    assert.equal(r.body.role, role)
    assert.equal(r.body.staff.id, id)
    assert.equal(r.body.staff.class_id, classId)
    assert.equal(r.body.expires_at, '2026-09-16T01:30:00.000Z', '12 hours')
    const me = await get('/api/staff/me', r.body.token)
    assert.equal(me.status, 200)
    assert.equal(me.body.staff.role, role)
    assert.equal(me.body.school_name, 'SAMPLE Harbour Pond Elementary (demo)')
    assert.equal(me.body.sample, true)
  }
  const bad = await call('POST', '/api/staff/signin', { body: { pin: '0000' } })
  assert.equal(bad.status, 401)
  assert.equal(bad.body.field, 'pin')
  assert.equal(bad.body.error, 'That PIN is not right.')
  const ip = 'rate-pin'
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/staff/signin', { body: { pin: `900${i}` }, ip })).status, 401)
  assert.equal((await call('POST', '/api/staff/signin', { body: { pin: PIN.admin }, ip })).status, 429)
  const expired = await get('/api/staff/me', await staffToken('admin'), '2026-09-16T01:30:00Z')
  assert.equal(expired.status, 401, 'a staff session ends after 12 hours')
})

test('role matrix: every role × one route per area → 200 / 403 / 401', async () => {
  const routes = { staff: '/api/staff/me', kitchen: '/api/kitchen/day', teacher: '/api/teacher/classes', office: '/api/office/families',
    admin: '/api/admin/settings' }
  const allowed = { admin: ['staff', 'kitchen', 'teacher', 'office', 'admin'], kitchen: ['staff', 'kitchen'], oldford: ['staff', 'teacher'] }
  const fam = await familyToken('fam-1')
  for (const who of Object.keys(allowed)) {
    const token = await staffToken(who)
    for (const [area, path] of Object.entries(routes)) {
      const r = await get(path, token)
      const want = allowed[who].includes(area) ? 200 : 403
      assert.equal(r.status, want, `${who} on ${path}: ${r.text}`)
      if (want === 403) assert.equal(r.body.error, 'That page is not for your PIN.')
    }
    assert.equal((await get('/api/family', token)).status, 401, `${who}'s staff token on a family route`)
  }
  for (const path of Object.values(routes)) {
    assert.equal((await get(path)).status, 401, `no token on ${path}`)
    assert.equal((await get(path, fam)).status, 401, `family token on ${path}`)
    assert.equal((await get(path, 'x'.repeat(43))).status, 401, `made-up token on ${path}`)
  }
  const office = await staffToken('admin')
  assert.equal((await call('POST', '/api/office/payments', { token: await staffToken('kitchen'), body: { family_id: 'fam-1', amount_cents: 100, method: 'cash' } })).status, 403)
  assert.equal((await call('POST', '/api/admin/no-school', { token: await staffToken('oldford'), body: { date: '2026-09-17', kind: 'closure' } })).status, 403)
  assert.equal((await get('/api/office/families', office)).status, 200)
})

test('sign out ends that session only', async () => {
  const a = await familyToken('fam-1')
  const b = await familyToken('fam-1')
  assert.equal((await call('POST', '/api/family/signout', { token: a })).status, 200)
  assert.equal((await get('/api/family', a)).status, 401)
  assert.equal((await get('/api/family', b)).status, 200)
  const s = await staffToken('kitchen')
  assert.equal((await call('POST', '/api/staff/signout', { token: s })).status, 200)
  assert.equal((await get('/api/kitchen/day', s)).status, 401)
})

test("family isolation: fam-2's token on fam-1's child, line and cancel → 404, and nothing changes", async () => {
  const fam1 = await familyToken('fam-1')
  const fam2 = await familyToken('fam-2')
  const placed = await order(fam1, [{ child_id: 'ch-ava', date: '2026-09-17', item_id: 'chili', qty: 1 }])
  const line = placed.order.lines[0]
  const child = { first_name: 'Hacked', class_id: 'room-2', allergies: [] }
  assert.equal((await call('PUT', '/api/family/children/ch-ava', { token: fam2, body: child })).status, 404)
  assert.equal((await call('DELETE', '/api/family/children/ch-ava', { token: fam2 })).status, 404)
  const o = await call('POST', '/api/family/orders', { token: fam2, body: { lines: [{ child_id: 'ch-ava', date: '2026-09-18', item_id: 'apple', qty: 1 }] } })
  assert.equal(o.status, 404)
  assert.equal(o.body.index, 0)
  const cancel = await call('POST', `/api/family/lines/${line.id}/cancel`, { token: fam2 })
  assert.equal(cancel.status, 404, cancel.text)
  assert.equal(cancel.body.code, 'not_found')
  assert.deepEqual((await get('/api/family/orders', fam2)).body.lines, [])
  assert.equal((await get('/api/family/ledger', fam2)).body.balance_cents, 0)
  const mine = (await get('/api/family/orders', fam1)).body.lines
  assert.equal(mine.length, 1)
  assert.equal(mine[0].status, 'active')
  assert.equal((await get('/api/family/ledger', fam1)).body.balance_cents, 475)
  assert.equal((await get('/api/family', fam1)).body.children.find((c) => c.id === 'ch-ava').first_name, 'Ava')
})

test('children: add with two allergies, edit, validation, at most 8, remove refused while lunches are ordered', async () => {
  const token = await familyToken('fam-4')
  const add = await call('POST', '/api/family/children', { token, body: { first_name: '  Mia  ', class_id: 'room-3', allergies: ['sesame', 'eggs'] } })
  assert.equal(add.status, 201, add.text)
  assert.match(add.body.child.id, /^ch_[0-9a-f]{16}$/)
  assert.deepEqual({ ...add.body.child, id: 'x' },
    { id: 'x', first_name: 'Mia', class_id: 'room-3', class_name: 'Room 5', grade: 'Grade 3', allergies: ['eggs', 'sesame'] })
  const id = add.body.child.id
  const edit = await call('PUT', `/api/family/children/${id}`, { token, body: { first_name: "Mia-Rose O'Dea", class_id: 'room-4', allergies: ['eggs'] } })
  assert.equal(edit.status, 200, edit.text)
  assert.equal(edit.body.child.first_name, "Mia-Rose O'Dea")
  assert.equal(edit.body.child.class_name, 'Room 7')
  assert.deepEqual(edit.body.child.allergies, ['eggs'])
  const fam = (await get('/api/family', token)).body
  assert.deepEqual(fam.children.map((c) => c.first_name), ["Mia-Rose O'Dea", 'Owen'], 'by first name')
  assert.equal(fam.classes.length, 7)
  assert.equal(fam.balance_cents, 0)

  const badBodies = [
    [{ first_name: '', class_id: 'room-3', allergies: [] }, 'first_name'],
    [{ first_name: 'R2D2', class_id: 'room-3', allergies: [] }, 'first_name'],
    [{ first_name: 'A'.repeat(31), class_id: 'room-3', allergies: [] }, 'first_name'],
    [{ first_name: 'Ben', class_id: 'room-99', allergies: [] }, 'class_id'],
    [{ first_name: 'Ben', class_id: 'room-3', allergies: ['nuts'] }, 'allergies'],
    [{ first_name: 'Ben', class_id: 'room-3', allergies: ['eggs', 'eggs'] }, 'allergies'],
    [{ first_name: 'Ben', class_id: 'room-3' }, 'allergies'],
  ]
  for (const [body, field] of badBodies) {
    const r = await call('POST', '/api/family/children', { token, body })
    assert.equal(r.status, 400, JSON.stringify(body))
    assert.equal(r.body.field, field, JSON.stringify(body))
  }
  for (let i = 0; i < 6; i++) assert.equal((await call('POST', '/api/family/children', { token, body: { first_name: `Kid ${'ABCDEF'[i]}`, class_id: 'room-1', allergies: [] } })).status, 201)
  const ninth = await call('POST', '/api/family/children', { token, body: { first_name: 'Nine', class_id: 'room-1', allergies: [] } })
  assert.equal(ninth.status, 409)
  assert.equal(ninth.body.code, 'bad_state')

  const fam1 = await familyToken('fam-1')
  const placed = await order(fam1, [{ child_id: 'ch-liam', date: '2026-09-17', item_id: 'chili', qty: 1 }])
  const refused = await call('DELETE', '/api/family/children/ch-liam', { token: fam1 })
  assert.equal(refused.status, 409)
  assert.equal(refused.body.code, 'bad_state')
  assert.equal(refused.body.error, 'Liam has lunches ordered for days still to come. Cancel them first.')
  assert.equal((await call('POST', `/api/family/lines/${placed.order.lines[0].id}/cancel`, { token: fam1 })).status, 200)
  assert.equal((await call('DELETE', '/api/family/children/ch-liam', { token: fam1 })).status, 200)
  assert.deepEqual((await get('/api/family', fam1)).body.children.map((c) => c.id), ['ch-ava'])
  assert.equal((await get('/api/family/orders', fam1)).body.lines[0].first_name, 'Liam', 'past lines keep their history')
  assert.equal((await call('PUT', '/api/family/children/ch-liam', { token: fam1, body: { first_name: 'Liam', class_id: 'room-2', allergies: [] } })).status, 404)
  const again = await call('POST', '/api/family/orders', { token: fam1, body: { lines: [{ child_id: 'ch-liam', date: '2026-09-18', item_id: 'apple', qty: 1 }] } })
  assert.equal(again.status, 404, 'a removed child cannot be ordered for')
})

test('new family code: the old code and every session of that family stop working; the new one signs in', async () => {
  const office = await staffToken('admin')
  const old = await familyToken('fam-1')
  const r = await call('POST', '/api/office/families/fam-1/code', { token: office })
  assert.equal(r.status, 200)
  assert.match(r.body.code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/)
  assert.equal((await get('/api/family', old)).status, 401)
  assert.equal((await call('POST', '/api/family/signin', { body: { code: CODE['fam-1'] } })).status, 401)
  const fresh = await call('POST', '/api/family/signin', { body: { code: r.body.code.toLowerCase() } })
  assert.equal(fresh.status, 200)
  assert.equal(fresh.body.family.id, 'fam-1')
  assert.equal((await get('/api/family', await familyToken('fam-2'))).status, 200, 'other families are untouched')
  assert.equal((await call('POST', '/api/office/families/nope/code', { token: office })).status, 404)
  assert.equal(NOW, '2026-09-15T13:30:00Z')
})
