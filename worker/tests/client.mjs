// A small client for the API suites: every call carries the test clock and a fresh test IP unless a test says otherwise.
export const BASE = process.env.API_BASE || 'http://127.0.0.1:8602'
export const NOW = '2026-09-15T13:30:00Z' // Tue Sep 15 2026, 11:00 AM NDT
export const PIN = { admin: '3141', kitchen: '2718', oldford: '1618', pardy: '1414' }
export const CODE = { 'fam-1': 'KQ7M-4RTX', 'fam-2': 'W3PH-8JND', 'fam-3': 'C9VB-6FYE', 'fam-4': 'T5ZA-2GUK' }

let ipSeq = 0

/** → { status, body, text, headers } */
export async function call(method, path, { body, token, now = NOW, ip, headers = {} } = {}) {
  const h = { 'X-Test-Now': now, 'X-Test-IP': ip || `t-${process.pid}-${++ipSeq}`, ...headers }
  if (body !== undefined) h['Content-Type'] = 'application/json'
  if (token) h.Authorization = `Bearer ${token}`
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await r.text()
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch {}
  return { status: r.status, body: parsed, text, headers: r.headers }
}

export async function reset(now = NOW) {
  const r = await call('POST', '/api/test/reset', { now })
  if (r.status !== 200) throw new Error(`reset: ${r.status} ${r.text}`)
  return r.body
}

export async function familyToken(familyId, now = NOW) {
  const r = await call('POST', '/api/family/signin', { body: { code: CODE[familyId] }, now })
  if (r.status !== 200) throw new Error(`family sign-in ${familyId}: ${r.status} ${r.text}`)
  return r.body.token
}

export async function staffToken(who, now = NOW) {
  const r = await call('POST', '/api/staff/signin', { body: { pin: PIN[who] }, now })
  if (r.status !== 200) throw new Error(`staff sign-in ${who}: ${r.status} ${r.text}`)
  return r.body.token
}

/** Place an order and expect 201. */
export async function order(token, lines, now = NOW) {
  const r = await call('POST', '/api/family/orders', { body: { lines }, token, now })
  if (r.status !== 201) throw new Error(`order: ${r.status} ${r.text}`)
  return r.body
}

export const get = (path, token, now = NOW) => call('GET', path, { token, now })

/** A small seeded PRNG (mulberry32), so a random run can be replayed from its seed. */
export function prng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
