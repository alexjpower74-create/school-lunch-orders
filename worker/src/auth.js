// Scaffold adapted from Visitor Log by sl-lead; sl1 owns it now. Roles here are admin, kitchen, teacher (docs/API.md "Auth").
// PINs (PBKDF2-SHA-256, 100 000 iterations, per-staff salt), bearer tokens (stored as SHA-256) and the wrong-PIN guard.
import { clientIp } from './clock.js'
import { ApiError, forbidden, unauthorized } from './http.js'

export const PBKDF2_ITERATIONS = 100000
export const SESSION_MS = 12 * 3600e3
export const PIN_WRONG_MAX = 5
export const PIN_WINDOW_MS = 15 * 60e3
export const PIN_RE = /^\d{4,6}$/
export const WRONG_PIN = 'That PIN is not right.'
export const SIGN_IN_AGAIN = 'Please sign in again.'
export const MANAGER_ONLY = 'Only a manager can change the settings.'
export const TOO_MANY = 'Too many tries. Wait 15 minutes, then try again.'

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)))

export async function hashPin(pin, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: PBKDF2_ITERATIONS }, key, 256)
  return hex(bits)
}

export function sameHex(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const sha256Hex = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

// 32 random bytes → 43 base64url characters.
export function randomToken(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const randomId = (prefix) => `${prefix}_${hex(crypto.getRandomValues(new Uint8Array(8)))}`
export const randomSaltHex = () => hex(crypto.getRandomValues(new Uint8Array(16)))

// ---------- the wrong-PIN guard (per client IP) ----------

const ipOf = (c) => clientIp(c.request, c.env)

// 5 wrong PINs from one IP within 15 minutes → 429 for the rest of that window, even for the right PIN.
export async function assertPinAllowed(c) {
  const r = await c.db.prepare('SELECT COUNT(*) AS n FROM pin_attempts WHERE ip = ? AND at > ?')
    .bind(ipOf(c), new Date(c.now.getTime() - PIN_WINDOW_MS).toISOString()).first()
  if (r.n >= PIN_WRONG_MAX) throw new ApiError(429, 'rate_limited', TOO_MANY)
}

export async function recordWrongPin(c) {
  await c.db.prepare('INSERT INTO pin_attempts (ip, at) VALUES (?, ?)').bind(ipOf(c), c.nowIso).run()
}

// The active staff member whose PIN this is, or null.
export async function staffByPin(c, pin) {
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return null
  const { results } = await c.db.prepare('SELECT * FROM staff WHERE active = 1 ORDER BY id').all()
  for (const s of results) {
    if (sameHex(await hashPin(pin, s.pin_salt), s.pin_hash)) return s
  }
  return null
}

// ---------- sessions ----------

export async function createSession(c, staffId) {
  const token = randomToken()
  const expires = new Date(c.now.getTime() + SESSION_MS).toISOString()
  await c.db.prepare('INSERT INTO sessions (token_hash, staff_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), staffId, c.nowIso, expires).run()
  return { token, expires_at: expires }
}

// role: 'staff' (staff or manager) | 'manager'. Sets c.session and c.staff { id, name, role }.
export async function requireRole(c, role) {
  const h = c.request.headers.get('Authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!token) throw unauthorized(SIGN_IN_AGAIN)
  const row = await c.db.prepare(`SELECT s.token_hash, s.staff_id, st.name, st.role FROM sessions s
    JOIN staff st ON st.id = s.staff_id WHERE s.token_hash = ? AND s.expires_at > ? AND st.active = 1`)
    .bind(await sha256Hex(token), c.nowIso).first()
  if (!row) throw unauthorized(SIGN_IN_AGAIN)
  c.session = row
  c.staff = { id: row.staff_id, name: row.name, role: row.role }
  if (role === 'manager' && row.role !== 'manager') throw forbidden(MANAGER_ONLY)
}
