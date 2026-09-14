// Shared by the parent pages: the signed-in family, the school header, the cart in localStorage, menu weeks and allergen words.
// Dates and times always come from the API; the only date arithmetic here is finding the Monday of a date string.
import { ApiError, api, session } from '../common/api.js'
import { balancePhrase, h, listWords, money, plural } from '../common/ui.js'

export { ApiError, balancePhrase, h, money, plural }

export const $ = (id) => document.getElementById(id)

/** The family session, or back to sign-in. */
export function requireSession() {
  const s = session.get('family')
  if (!s?.token || !s.family?.id) {
    location.replace('/')
    return null
  }
  return s
}

/** A family API call. A 401 anywhere means the session is gone: back to sign-in. */
export async function familyApi(method, path, body) {
  try {
    return await api(method, path, { auth: 'family', body })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      session.clear('family')
      location.replace('/')
      await new Promise(() => {}) // the page is leaving
    }
    throw e
  }
}

export const getInfo = () => api('GET', '/api/info')

export async function signOut() {
  try {
    await api('POST', '/api/family/signout', { auth: 'family' })
  } catch {}
  session.clear('family')
  location.replace('/')
}

const ICONS = {
  school: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 5l9 5-9 5-9-5Z"/><path d="M7 12v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>',
}

export function icon(name) {
  const span = document.createElement('span')
  span.className = 'icon'
  span.setAttribute('aria-hidden', 'true')
  span.innerHTML = ICONS[name]
  return span
}

/** The school name and SAMPLE badge in #top, linking home. */
export function renderHeader(info, { home = '/family/' } = {}) {
  $('top').replaceChildren(
    h('a', { class: 'school', href: home }, icon('school'), h('span', { id: 'school-name' }, info.school_name || 'School lunches')),
    info.sample ? h('span', { class: 'sample-badge' }, 'SAMPLE') : null,
  )
}

/** Allergen labels and conflicts from /api/info's list (its order is the list order). */
export function allergenTools(info) {
  const labels = new Map(info.allergens.map((a) => [a.key, a.label]))
  const order = info.allergens.map((a) => a.key)
  return {
    label: (key) => labels.get(key) || key,
    words: (keys) => listWords(keys.map((k) => labels.get(k) || k)),
    /** The item's allergens that are in this one child's allergies, in list order. */
    conflicts: (itemAllergens, childAllergies) => order.filter((k) => itemAllergens.includes(k) && childAllergies.includes(k)),
  }
}

/** "Liam is allergic to Milk. Macaroni and cheese contains Milk." */
export const warningText = (firstName, words, itemName) => `${firstName} is allergic to ${words}. ${itemName} contains ${words}.`

export const classWords = (child) => [child.class_name, child.grade].filter(Boolean).join(' · ')

// ---------- the cart: [{ child_id, date, item_id, qty, allergen_ack }] in localStorage per family ----------

const cartKey = (familyId) => `school-lunch:cart:${familyId}`
const okLine = (l) => l && typeof l.child_id === 'string' && typeof l.date === 'string' && typeof l.item_id === 'string' &&
  Number.isInteger(l.qty) && l.qty > 0

export function readCart(familyId) {
  try {
    const v = JSON.parse(localStorage.getItem(cartKey(familyId)) || '[]')
    return Array.isArray(v) ? v.filter(okLine).map((l) => ({ ...l, allergen_ack: l.allergen_ack === true })) : []
  } catch {
    return []
  }
}

export function writeCart(familyId, lines) {
  try {
    localStorage.setItem(cartKey(familyId), JSON.stringify(lines))
  } catch {}
}

export const sameLine = (a, b) => a.child_id === b.child_id && a.date === b.date && a.item_id === b.item_id

// ---------- menu weeks, fetched once per page ----------

/** The Monday of a YYYY-MM-DD date (calendar arithmetic on the API's date, not the browser clock). */
export function mondayOf(date) {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7))
  return t.toISOString().slice(0, 10)
}

const weeks = new Map()

/** A week of the menu (any date in it), or the API's default week when date is empty. */
export function menuWeek(date) {
  const key = date ? mondayOf(date) : ''
  if (!weeks.has(key)) {
    const p = familyApi('GET', date ? `/api/family/menu?week=${key}` : '/api/family/menu')
    weeks.set(key, p)
    p.then((w) => weeks.set(w.week_start, p), () => weeks.delete(key))
  }
  return weeks.get(key)
}

export function forgetWeeks() {
  weeks.clear()
}

/** A message element: set its words and show it, or hide it when empty. */
export function say(el, text) {
  el.textContent = text || ''
  el.hidden = !text
}

/** Run the page; anything unexpected shows in #page-error instead of a blank screen. */
export function run(start) {
  start().catch((e) => {
    const el = $('page-error')
    if (el) say(el, e?.message || 'Something went wrong. Try again.')
    const loading = $('loading')
    if (loading) loading.hidden = true
  })
}
