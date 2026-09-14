// Shared e2e helpers. Lead-owned: slices import them and ask the lead for changes in their build report.
// REAL input only: tap() hit-tests the target's centre with elementFromPoint before a real touch or click, typing goes through
// page.keyboard, and evaluate is only ever used to read. Setting up data through the API is fine (sessions, orders, payments,
// closures); the thing under test is always driven through the page. Adapted from Visitor Log and Daycare Day Sheet.
import { expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEVICES } from '../playwright.config.mjs'

export const NOW = '2026-09-15T13:30:00Z' // Tue Sep 15 2026, 11:00 AM NDT: the docs/API.md test anchor
export const SCHOOL = 'SAMPLE Harbour Pond Elementary (demo)'
export const PIN = { admin: '3141', kitchen: '2718', oldford: '1618', pardy: '1414' } // SAMPLE staff
export const CODE = { liamAva: 'KQ7M-4RTX', noah: 'W3PH-8JND', emmaJackChloe: 'C9VB-6FYE', owen: 'T5ZA-2GUK' } // SAMPLE families
export const PORT = Number(process.env.E2E_PORT || 8603)
export const BASE = `http://127.0.0.1:${PORT}`
const HERE = path.dirname(fileURLToPath(import.meta.url))

// nl('2026-09-17', '12:00') → the ISO instant of noon St. John's time that day (NDT −2:30 or NST −3:30, whichever is in effect).
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/St_Johns', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export function nl(date, hhmm) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  for (const off of [150, 210]) {
    const t = new Date(wall + off * 60000)
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]))
    if (`${p.year}-${p.month}-${p.day}` === date && Number(p.hour) === hh && Number(p.minute) === mm) return t.toISOString()
  }
  throw new Error(`nl(${date}, ${hhmm}): not a real St. John's time`)
}

// ---------- context setup ----------
const LOCAL = new Set(['127.0.0.1', 'localhost'])
const isThirdParty = (url) => /^https?:$/.test(url.protocol) && !LOCAL.has(url.hostname)

/** Pinned server clock and a record of anything that tried to leave this computer. */
export async function guardContext(context, { now = NOW } = {}) {
  await context.setExtraHTTPHeaders({ 'X-Test-Now': now })
  const offenders = []
  context.__offenders = offenders
  await context.route(isThirdParty, (route) => {
    offenders.push(route.request().url())
    return route.abort()
  })
}

/** Move the server clock the pages see (every later request from this context carries it). */
export async function setNow(context, now) {
  await context.setExtraHTTPHeaders({ 'X-Test-Now': now })
}

/** Fail when any request tried to reach a host other than 127.0.0.1. */
export function assertNoThirdParty(context) {
  expect(context.__offenders ?? [], 'requests that tried to leave 127.0.0.1').toEqual([])
}

/** Every test starts here: a clean SAMPLE school and a guarded context. */
export async function fresh(context, request, { now = NOW } = {}) {
  await guardContext(context, { now })
  const r = await request.post('/api/test/reset', { headers: { 'X-Test-Now': now } })
  expect(r.status(), 'POST /api/test/reset').toBe(200)
}

/** Another person on another device: 'phone' (a parent or a teacher) or 'desktop' (kitchen, office). Same engine. */
export async function newContext(browser, kind, { now = NOW } = {}) {
  const context = await browser.newContext({ ...DEVICES[kind], baseURL: BASE })
  await guardContext(context, { now })
  return context
}

// ---------- API setup helpers (setup only; never for the thing under test) ----------
let ipSeq = 0
export async function api(request, method, url, data, headers = {}, { now = NOW } = {}) {
  const r = await request.fetch(url, { method, data, headers: { 'X-Test-Now': now, 'X-Test-IP': `setup-${process.pid}-${++ipSeq}`, ...headers } })
  const text = await r.text()
  let body = text
  try { body = JSON.parse(text) } catch {}
  return { status: r.status(), body, type: r.headers()['content-type'] || '', headers: r.headers() }
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` })

export async function familySignIn(request, code, { now = NOW } = {}) {
  const r = await api(request, 'POST', '/api/family/signin', { code }, {}, { now })
  expect(r.status, `family sign-in with SAMPLE code ${code}: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body // { token, family, expires_at }
}
export const familyToken = async (request, code, opts) => (await familySignIn(request, code, opts)).token

export async function staffSignIn(request, pin, { now = NOW } = {}) {
  const r = await api(request, 'POST', '/api/staff/signin', { pin }, {}, { now })
  expect(r.status, `staff sign-in with SAMPLE PIN ${pin}: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body // { token, role, staff, expires_at }
}
export const staffToken = async (request, pin, opts) => (await staffSignIn(request, pin, opts)).token

// The page opens already signed in, exactly as the sign-in page leaves localStorage (common/api.js session.set). Written once
// per tab (a sessionStorage flag), so a sign-out inside the test is not undone by the next navigation.
async function seedSession(context, key, value) {
  await context.addInitScript(([k, v]) => {
    try {
      if (sessionStorage.getItem(`seeded:${k}`)) return
      localStorage.setItem(k, v)
      sessionStorage.setItem(`seeded:${k}`, '1')
    } catch {}
  }, [key, JSON.stringify(value)])
}
export async function useFamilySession(context, request, code, opts) {
  const s = await familySignIn(request, code, opts)
  await seedSession(context, 'school-lunch:family', s)
  return s
}
export async function useStaffSession(context, request, pin, opts) {
  const s = await staffSignIn(request, pin, opts)
  await seedSession(context, 'school-lunch:staff', s)
  return s
}

/** Place an order through the API (setup). lines: [{ child_id, date, item_id, qty, allergen_ack? }]. Expects 201. */
export async function placeOrderViaApi(request, token, lines, { now = NOW } = {}) {
  const r = await api(request, 'POST', '/api/family/orders', { lines }, bearer(token), { now })
  expect(r.status, `placeOrderViaApi: ${JSON.stringify(r.body)}`).toBe(201)
  return r.body
}
export async function familyViaApi(request, token, { now = NOW } = {}) {
  const r = await api(request, 'GET', '/api/family', undefined, bearer(token), { now })
  expect(r.status, `familyViaApi: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body
}
export async function familyOrdersViaApi(request, token, { now = NOW } = {}) {
  const r = await api(request, 'GET', '/api/family/orders', undefined, bearer(token), { now })
  expect(r.status, `familyOrdersViaApi: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body.lines
}
export async function kitchenDayViaApi(request, token, date, { now = NOW } = {}) {
  const r = await api(request, 'GET', `/api/kitchen/day?date=${date}`, undefined, bearer(token), { now })
  expect(r.status, `kitchenDayViaApi: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body
}
export async function noSchoolViaApi(request, adminToken, { date, kind = 'closure', note = '' }, { now = NOW } = {}) {
  const r = await api(request, 'POST', '/api/admin/no-school', { date, kind, note }, bearer(adminToken), { now })
  expect(r.status, `noSchoolViaApi: ${JSON.stringify(r.body)}`).toBe(201)
  return r.body
}
export async function paymentViaApi(request, adminToken, { family_id, amount_cents, method = 'etransfer', note = '' }, { now = NOW } = {}) {
  const r = await api(request, 'POST', '/api/office/payments', { family_id, amount_cents, method, note }, bearer(adminToken), { now })
  expect(r.status, `paymentViaApi: ${JSON.stringify(r.body)}`).toBe(201)
  return r.body
}

// ---------- real input ----------
export const isCoarse = (page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches)

async function hitTest(locator, x, y) {
  return locator.evaluate((el, [px, py]) => {
    const t = document.elementFromPoint(px, py)
    return t === el || el.contains(t) ? '' : t ? t.outerHTML.slice(0, 160) : 'nothing'
  }, [x, y])
}

/** Hit-test the centre with elementFromPoint, then a real touch (coarse pointer) or mouse click. */
export async function tap(page, locator, label = String(locator)) {
  await expect(locator).toBeVisible()
  await locator.scrollIntoViewIfNeeded()
  let box = await locator.boundingBox()
  expect(box, `tap(${label}): no box`).not.toBeNull()
  // "In view" to Playwright includes under a sticky header or footer, where a person could not tap it. Pages mark those with
  // data-sticky-header / data-sticky-footer; only then is the target scrolled to the middle first. Anything else on top fails.
  const [headerBottom, footerTop] = await page.evaluate(() => [
    Math.max(0, ...[...document.querySelectorAll('[data-sticky-header]')].map((h) => h.getBoundingClientRect().bottom)),
    Math.min(innerHeight, ...[...document.querySelectorAll('[data-sticky-footer]')].filter((f) => f.getBoundingClientRect().height > 0)
      .map((f) => f.getBoundingClientRect().top)),
  ])
  const cy = box.y + box.height / 2
  const insideSticky = (el) => locator.evaluate((node) => !!node.closest('[data-sticky-header], [data-sticky-footer]'))
  if ((cy < headerBottom || cy > footerTop) && !(await insideSticky())) {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    box = await locator.boundingBox()
  }
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  expect(await hitTest(locator, x, y), `tap(${label}) hit-test at ${Math.round(x)},${Math.round(y)}: something else is on top`).toBe('')
  if (await isCoarse(page)) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

/** Tap into a field and type. clear: select what is there first so typing replaces it. */
export async function type(page, locator, text, { clear = false } = {}) {
  await tap(page, locator)
  await expect(locator).toBeFocused()
  if (clear) { await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace') }
  // Touch projects send text the way a phone's on-screen keyboard does (insertText): Chromium's emulated touch silently drops
  // key presses typed straight after a touch tap (found on Firewood Orders). Mouse projects use real key presses.
  if (await isCoarse(page)) await page.keyboard.insertText(String(text))
  else await page.keyboard.type(String(text))
}

/** Tap PIN digits on an on-screen keypad (buttons .key[data-key]), then the submit button. */
export async function keypad(page, pin, submit) {
  for (const d of String(pin)) await tap(page, page.locator(`button.key[data-key="${d}"]`), `key ${d}`)
  if (submit) await tap(page, submit, 'keypad submit')
}

/** Size + hit-test for a tap target (size from the box is fine; occlusion only from elementFromPoint). */
export async function expectTapTarget(page, locator, min = 44, label = String(locator)) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  expect(box, `${label}: no box`).not.toBeNull()
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(min)
  expect(box.width, `${label} width`).toBeGreaterThanOrEqual(min)
  expect(await hitTest(locator, box.x + box.width / 2, box.y + box.height / 2), `${label}: something else is on top`).toBe('')
}

/** No sideways scroll on the page. */
export async function expectNoHorizontalScroll(page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw, 'page scrolls sideways').toBeLessThanOrEqual(cw)
}

/** WCAG contrast of an element's computed text colour on its first opaque background up the tree. */
export async function contrastOf(locator) {
  return locator.evaluate((el) => {
    const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number)
    const lum = ([r, g, b]) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const fg = parse(getComputedStyle(el).color)
    let n = el; let bg = null
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n)
      const c = parse(cs.backgroundColor)
      if (c.length >= 3 && (c.length === 3 || c[3] > 0.99)) { bg = c; break }
      if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
        const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g) || []
        const ratios = stops.map((s) => { const b = parse(s); const [a, d] = [lum(fg), lum(b)].sort((x, y) => y - x); return (a + 0.05) / (d + 0.05) })
        if (ratios.length) return Math.min(...ratios)
      }
      n = n.parentElement
    }
    bg = bg || [11, 16, 32]
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
    return (a + 0.05) / (b + 0.05)
  })
}

// ---------- screenshots ----------
/** Viewport screenshot into app/tests/<dir>/shots/<project>-<name>.png (dir: family | staff | journey). Viewport, not full page:
 *  full-page captures misplace sticky and fixed bars on phone screens (found on Firewood Orders). */
export async function shot(page, testInfo, dir, name) {
  const out = path.join(HERE, dir, 'shots')
  mkdirSync(out, { recursive: true })
  await page.waitForTimeout(60)
  await page.screenshot({ path: path.join(out, `${testInfo.project.name}-${name}.png`), animations: 'disabled' })
}
