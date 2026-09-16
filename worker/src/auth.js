// Sign-in for families (a family code) and staff (a PIN), bearer sessions, the role matrix and the wrong-try guards
// (docs/API.md "Auth"). Scaffold adapted from Visitor Log; sl1 owns it.
import { clientIp } from './clock.js'
import { normalizeCode } from './codes.js'
import { loadCal, readJson, staffOut } from './db.js'
import { ApiError, forbidden, json, unauthorized } from './http.js'

export const PBKDF2_ITERATIONS = 100000
export const FAMILY_SESSION_MS = 90 * 24 * 3600e3
export const STAFF_SESSION_MS = 12 * 3600e3
export const PIN_WRONG_MAX = 5
export const CODE_WRONG_MAX = 10
export const TRY_WINDOW_MS = 15 * 60e3
export const PIN_RE = /^\d{4,6}$/
export const WRONG_PIN = 'That PIN is not right.'
export const WRONG_CODE = "That family code doesn't match. Check the paper from the school, or ask the office."
export const SIGN_IN_AGAIN = 'Please sign in again.'
export const NOT_YOUR_PAGE = 'That page is not for your PIN.'
export const TOO_MANY = 'Too many tries. Wait 15 minutes, then try again.'

// Which staff roles may use each area of /api/<area>/*.
export const ROLE_AREAS = {
  staff: ['admin', 'kitchen', 'teacher'],
  kitchen: ['admin', 'kitchen'],
  teacher: ['admin', 'teacher'],
  office: ['admin'],
  admin: ['admin'],
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)))

export async function hashPin(pin, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return hex(bits)
}

export function sameHex(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const sha256Hex = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

/** The stored form of a family code: SHA-256 of its 8 normalised characters. */
export const codeHash = (code) => sha256Hex(normalizeCode(code))

// 32 random bytes → 43 base64url characters.
export function randomToken(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export const randomId = (prefix) => `${prefix}_${hex(crypto.getRandomValues(new Uint8Array(8)))}`
export const randomSaltHex = () => hex(crypto.getRandomValues(new Uint8Array(16)))

// ---------- wrong-try guards (per client IP, 15-minute window) ----------

async function assertAllowed(c, table, max) {
  const r = await c.db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ip = ? AND at > ?`)
    .bind(clientIp(c.request, c.env), new Date(c.now.getTime() - TRY_WINDOW_MS).toISOString())
    .first()
  if (r.n >= max) throw new ApiError(429, 'rate_limited', TOO_MANY)
}
const recordWrong = (c, table) =>
  c.db.prepare(`INSERT INTO ${table} (ip, at) VALUES (?, ?)`).bind(clientIp(c.request, c.env), c.nowIso).run()

export const assertPinAllowed = (c) => assertAllowed(c, 'pin_attempts', PIN_WRONG_MAX)
export const assertCodeAllowed = (c) => assertAllowed(c, 'code_attempts', CODE_WRONG_MAX)

/** The active staff member whose PIN this is, or null. */
export async function staffByPin(db, pin, { includeInactive = false, exceptId = null } = {}) {
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return null
  const { results } = await db.prepare(`SELECT * FROM staff ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY id`).all()
  for (const s of results) {
    if (s.id === exceptId) continue
    if (sameHex(await hashPin(pin, s.pin_salt), s.pin_hash)) return s
  }
  return null
}

// ---------- sessions ----------

async function createSession(c, kind, subjectId) {
  const token = randomToken()
  const ms = kind === 'family' ? FAMILY_SESSION_MS : STAFF_SESSION_MS
  const expires = new Date(c.now.getTime() + ms).toISOString()
  await c.db
    .prepare('INSERT INTO sessions (token_hash, kind, subject_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), kind, subjectId, c.nowIso, expires)
    .run()
  return { token, expires_at: expires }
}

async function sessionOf(c, kind) {
  const h = c.request.headers.get('Authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!token) throw unauthorized(SIGN_IN_AGAIN)
  const hash = await sha256Hex(token)
  const row = await c.db
    .prepare('SELECT * FROM sessions WHERE token_hash = ? AND kind = ? AND expires_at > ?')
    .bind(hash, kind, c.nowIso)
    .first()
  if (!row) throw unauthorized(SIGN_IN_AGAIN)
  return row
}

/** Sets c.family { id, label } and c.sessionHash. */
export async function requireFamily(c) {
  const s = await sessionOf(c, 'family')
  const f = await c.db.prepare('SELECT id, label FROM families WHERE id = ?').bind(s.subject_id).first()
  if (!f) throw unauthorized(SIGN_IN_AGAIN)
  c.family = f
  c.sessionHash = s.token_hash
}

/** Sets c.staff { id, name, role, class_id } and c.sessionHash; 403 when the role may not use this area. */
export async function requireStaff(c, area) {
  const s = await sessionOf(c, 'staff')
  const st = await c.db.prepare('SELECT * FROM staff WHERE id = ? AND active = 1').bind(s.subject_id).first()
  if (!st) throw unauthorized(SIGN_IN_AGAIN)
  c.staff = { id: st.id, name: st.name, role: st.role, class_id: st.class_id ?? null }
  c.sessionHash = s.token_hash
  if (!(ROLE_AREAS[area] || []).includes(st.role)) throw forbidden(NOT_YOUR_PAGE)
}

// ---------- routes ----------

export async function familySignIn(c) {
  const body = await readJson(c)
  await assertCodeAllowed(c)
  const code = normalizeCode(body.code)
  const fam = code
    ? await c.db
        .prepare('SELECT id, label FROM families WHERE code_hash = ?')
        .bind(await codeHash(code))
        .first()
    : null
  if (!fam) {
    await recordWrong(c, 'code_attempts')
    throw unauthorized(WRONG_CODE, { field: 'code' })
  }
  const s = await createSession(c, 'family', fam.id)
  return json({ token: s.token, family: { id: fam.id, label: fam.label }, expires_at: s.expires_at })
}

export async function staffSignIn(c) {
  const body = await readJson(c)
  await assertPinAllowed(c)
  const st = await staffByPin(c.db, body.pin)
  if (!st) {
    await recordWrong(c, 'pin_attempts')
    throw unauthorized(WRONG_PIN, { field: 'pin' })
  }
  const s = await createSession(c, 'staff', st.id)
  const { active, ...staff } = staffOut(st)
  return json({ token: s.token, role: st.role, staff, expires_at: s.expires_at })
}

export async function signOut(c) {
  await c.db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(c.sessionHash).run()
  return json({ ok: true })
}

export async function staffMe(c) {
  const cal = await loadCal(c.db)
  return json({ staff: c.staff, school_name: cal.school.school_name, sample: cal.school.sample })
}
