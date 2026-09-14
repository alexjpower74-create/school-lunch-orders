// Shared code for the staff pages (kitchen, labels, teacher, office, settings). sl2-owned.
// Session 'staff' → { token, role, staff, expires_at } (common/api.js). A 401 clears it and goes back to /staff/; a 403 (or a
// page the role may not use) shows "That page is not for your PIN." with a link to the role's own page.
import { api, ApiError, session } from '../common/api.js'
import { h, listWords } from '../common/ui.js'

export const ROLE_HOME = { admin: '/office/', kitchen: '/kitchen/', teacher: '/teacher/' }
export const FORBIDDEN = 'That page is not for your PIN.'
const PAGES = [
  { key: 'kitchen', href: '/kitchen/', label: 'Kitchen', roles: ['admin', 'kitchen'] },
  { key: 'teacher', href: '/teacher/', label: 'Teacher', roles: ['admin', 'teacher'] },
  { key: 'office', href: '/office/', label: 'Office', roles: ['admin'] },
  { key: 'admin', href: '/admin/', label: 'Settings', roles: ['admin'] },
]

export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12.5h17a8.5 8.5 0 0 1-17 0Z"/><path d="M9 4.5c-.8 1 .8 2-.1 3M12.5 3.5c-.8 1 .8 2-.1 3M16 4.5c-.8 1 .8 2-.1 3"/></svg>'

/** The school name, SAMPLE badge and bowl icon, used by every staff header and the PIN page. */
export function brand(schoolName = 'School Lunch Orders', sample = false) {
  const el = h('div', { class: 'brand' })
  el.innerHTML = ICON
  el.append(h('span', { class: 'brand-name', id: 'school-name' }, schoolName), h('span', { class: 'sample-badge', hidden: !sample }, 'SAMPLE'))
  return el
}

let infoPromise
/** GET /api/info once per page (allergen labels, today, school name). */
export function getInfo() {
  infoPromise ||= api('GET', '/api/info')
  return infoPromise
}

/** ['milk', 'eggs'] → "Milk and Eggs", labels from /api/info. */
export function allergenWords(info, keys) {
  const labels = new Map((info?.allergens || []).map((a) => [a.key, a.label]))
  return listWords((keys || []).map((k) => labels.get(k) || k))
}

let forbiddenShown = false
export function showForbidden(role) {
  if (forbiddenShown) return
  forbiddenShown = true
  const home = PAGES.find((p) => p.href === ROLE_HOME[role])
  const main = $('main')
  main.replaceChildren(h('section', { class: 'card notice', id: 'forbidden', role: 'alert' },
    h('h1', {}, FORBIDDEN),
    home ? h('a', { class: 'btn btn-primary', id: 'forbidden-home', href: home.href }, `Go to the ${home.label.toLowerCase()} page`) : null))
}

/** The API with the staff token. 401 → sign-in page; 403 → the "not for your PIN" screen. Errors still throw. */
export async function staffApi(method, path, opts = {}) {
  try {
    return await api(method, path, { ...opts, auth: 'staff' })
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      session.clear('staff')
      location.replace('/staff/')
    } else if (err instanceof ApiError && err.status === 403) {
      showForbidden(session.get('staff')?.role)
    }
    throw err
  }
}

/** True when staffApi already dealt with the error (sign-in redirect or the forbidden screen). */
export const handled = (err) => err instanceof ApiError && (err.status === 401 || err.status === 403)

/** Show an error's plain words in an element (role="alert" in the markup). */
export function showError(el, err) {
  if (!el) return
  el.textContent = err?.message || String(err)
  el.hidden = false
}
export function clearMessage(el) {
  if (!el) return
  el.textContent = ''
  el.hidden = true
}

function renderHeader(s, key) {
  const header = $('[data-sticky-header]')
  const nav = h('nav', { id: 'staff-nav', 'aria-label': 'Staff pages' },
    PAGES.filter((p) => p.roles.includes(s.role)).map((p) =>
      h('a', { href: p.href, dataset: { nav: p.key }, 'aria-current': p.key === key ? 'page' : null }, p.label)))
  const signOut = h('button', { class: 'btn btn-quiet', id: 'staff-sign-out', type: 'button', onclick: signOutNow }, 'Sign out')
  header.replaceChildren(brand(), h('span', { class: 'staff-who', id: 'staff-name' }, s.staff?.name || ''), nav, signOut)
}

async function signOutNow() {
  try { await api('POST', '/api/staff/signout', { auth: 'staff' }) } catch {}
  session.clear('staff')
  location.replace('/staff/')
}

/**
 * Every staff page starts here. Returns { session, me, info } or null when the page is not for this PIN (the forbidden
 * screen is already showing) or there is no session (already on the way to /staff/).
 */
export async function startStaffPage(key) {
  const s = session.get('staff')
  // Expiry is the server's call (its clock can be pinned in tests); an expired token comes back 401 and lands on /staff/.
  if (!s?.token) {
    location.replace('/staff/')
    return null
  }
  renderHeader(s, key)
  const page = PAGES.find((p) => p.key === key)
  const [me, info] = await Promise.all([staffApi('GET', '/api/staff/me').catch((e) => (handled(e) ? null : Promise.reject(e))), getInfo()])
  if (!me) return null
  $('[data-sticky-header] .brand').replaceWith(brand(me.school_name || info.school_name, me.sample))
  $('#staff-name').textContent = me.staff.name
  if (!page.roles.includes(me.staff.role)) {
    showForbidden(me.staff.role)
    return null
  }
  return { session: s, me, info }
}

/** "12.50", "$12.50", "12", "1,200.5" → integer cents; anything else → null. No floating point. */
export function parseDollars(text) {
  const m = /^\s*(-)?\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{0,2}))?\s*$/.exec(String(text ?? ''))
  if (!m || (m[2] === undefined && !m[3])) return null
  const whole = Number((m[2] || '0').replace(/,/g, ''))
  const cents = Number((m[3] || '').padEnd(2, '0') || '0')
  const total = whole * 100 + cents
  return m[1] ? -total : total
}

/** cents → "12.50" for a dollars input. */
export const dollarsValue = (cents) => `${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`

/** Fetch a CSV with the staff token and hand it to the browser as a download (a real <a download> click). */
export async function downloadCsv(path, fallbackName) {
  const r = await staffApi('GET', path, { raw: true })
  const blob = await r.blob()
  const m = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')
  const a = h('a', { href: URL.createObjectURL(blob), download: m ? m[1] : fallbackName, hidden: true })
  document.body.append(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 2000)
}

/** Disable a button while a request runs. */
export async function busy(button, fn) {
  if (button) button.disabled = true
  try { return await fn() } finally { if (button) button.disabled = false }
}

/** "Room 4 · Grade 2" */
export const classWords = (name, grade) => [name, grade].filter(Boolean).join(' · ')
