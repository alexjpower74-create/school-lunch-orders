// Shared fetch wrapper for every page. Lead-owned: slices import it and ask the lead for changes in their build report.
// Same origin: the Worker serves /api/* and these pages. A refusal throws ApiError carrying the API's { error, code, field, ... }.
// Sessions live in localStorage: 'family' → { token, family, expires_at }, 'staff' → { token, role, staff, expires_at }.

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || 'Something went wrong. Try again.')
    this.status = status
    this.code = body?.code || `http_${status}`
    this.field = body?.field
    this.body = body || {}
  }
}

const KEYS = { family: 'school-lunch:family', staff: 'school-lunch:staff' }

export const session = {
  get(kind) {
    try {
      return JSON.parse(localStorage.getItem(KEYS[kind]) || 'null')
    } catch {
      return null
    }
  },
  set(kind, value) {
    try {
      localStorage.setItem(KEYS[kind], JSON.stringify(value))
    } catch {}
  },
  clear(kind) {
    try {
      localStorage.removeItem(KEYS[kind])
    } catch {}
  },
}

/**
 * api('GET', '/api/info') · api('POST', '/api/family/orders', { body, auth: 'family' })
 * auth: 'family' | 'staff' adds that session's Bearer token. Returns the parsed JSON (or text for CSV).
 * raw: true returns the Response itself (for CSV downloads) after the same error handling.
 */
export async function api(method, path, { body, auth, raw = false } = {}) {
  const headers = {}
  if (auth) {
    const s = session.get(auth)
    if (s?.token) headers.Authorization = `Bearer ${s.token}`
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let r
  try {
    r = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
  } catch {
    throw new ApiError(0, { error: "Can't reach the school's server. Check your connection and try again.", code: 'offline' })
  }
  const type = r.headers.get('content-type') || ''
  if (!r.ok) {
    const data = type.includes('application/json') ? await r.json().catch(() => null) : null
    throw new ApiError(r.status, data)
  }
  if (raw) return r
  return type.includes('application/json') ? r.json() : r.text()
}
