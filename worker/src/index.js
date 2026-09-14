// School Lunch Orders Worker: /api/* here, everything else from app/public (the ASSETS binding). docs/API.md is the contract.
import * as admin from './admin.js'
import { familySignIn, requireFamily, requireStaff, signOut, staffMe, staffSignIn } from './auth.js'
import { now as clockNow, testMode } from './clock.js'
import * as family from './family.js'
import { ApiError, json } from './http.js'
import { info } from './info.js'
import { kitchenDay, kitchenLabels } from './kitchen.js'
import * as office from './office.js'
import { cancelLine, placeOrder } from './orders.js'
import { teacherClasses, teacherDay, teacherMark } from './teacher.js'
import { testReset, testSeed } from './testroutes.js'
import { localDate } from './time.js'

// auth: null (anyone), 'family', 'staff' (the area is the path's second segment: staff, kitchen, teacher, office, admin), 'test'.
const route = (method, path, auth, fn) =>
  ({ method, re: new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), auth, fn })

const ROUTES = [
  route('GET', '/api/info', null, info),

  route('POST', '/api/family/signin', null, familySignIn),
  route('POST', '/api/family/signout', 'family', signOut),
  route('GET', '/api/family', 'family', family.getFamily),
  route('POST', '/api/family/children', 'family', family.addChild),
  route('PUT', '/api/family/children/:id', 'family', family.updateChild),
  route('DELETE', '/api/family/children/:id', 'family', family.removeChild),
  route('GET', '/api/family/menu', 'family', family.familyMenu),
  route('GET', '/api/family/orders', 'family', family.familyOrders),
  route('POST', '/api/family/orders', 'family', placeOrder),
  route('POST', '/api/family/lines/:id/cancel', 'family', cancelLine),
  route('GET', '/api/family/ledger', 'family', family.familyLedger),

  route('POST', '/api/staff/signin', null, staffSignIn),
  route('POST', '/api/staff/signout', 'staff', signOut),
  route('GET', '/api/staff/me', 'staff', staffMe),

  route('GET', '/api/kitchen/day', 'staff', kitchenDay),
  route('GET', '/api/kitchen/labels', 'staff', kitchenLabels),

  route('GET', '/api/teacher/classes', 'staff', teacherClasses),
  route('GET', '/api/teacher/day', 'staff', teacherDay),
  route('POST', '/api/teacher/mark', 'staff', teacherMark),

  route('GET', '/api/office/families', 'staff', office.officeFamilies),
  route('POST', '/api/office/families', 'staff', office.addFamily),
  route('PUT', '/api/office/families/:id', 'staff', office.renameFamily),
  route('POST', '/api/office/families/:id/code', 'staff', office.newFamilyCode),
  route('GET', '/api/office/families/:id', 'staff', office.familyDetail),
  route('POST', '/api/office/payments', 'staff', office.recordPayment),
  route('POST', '/api/office/adjustments', 'staff', office.recordAdjustment),
  route('POST', '/api/office/entries/:id/void', 'staff', office.voidEntry),
  route('GET', '/api/office/ledger.csv', 'staff', office.ledgerCsv),
  route('GET', '/api/office/balances.csv', 'staff', office.balancesCsv),

  route('GET', '/api/admin/settings', 'staff', admin.getSettings),
  route('PUT', '/api/admin/school', 'staff', admin.putSchool),
  route('POST', '/api/admin/items', 'staff', admin.addItem),
  route('PUT', '/api/admin/items/:id', 'staff', admin.putItem),
  route('GET', '/api/admin/menu', 'staff', admin.getMenu),
  route('POST', '/api/admin/menu/fill', 'staff', admin.fillMenuWeek),
  route('PUT', '/api/admin/menu/:date', 'staff', admin.putMenuDay),
  route('GET', '/api/admin/no-school/preview', 'staff', admin.previewNoSchool),
  route('POST', '/api/admin/no-school', 'staff', admin.addNoSchool),
  route('DELETE', '/api/admin/no-school/:date', 'staff', admin.deleteNoSchool),
  route('POST', '/api/admin/classes', 'staff', admin.addClass),
  route('PUT', '/api/admin/classes/:id', 'staff', admin.putClass),
  route('POST', '/api/admin/staff', 'staff', admin.addStaff),
  route('PUT', '/api/admin/staff/:id', 'staff', admin.putStaff),

  route('POST', '/api/test/reset', 'test', testReset),
  route('POST', '/api/test/seed', 'test', testSeed),
]

const NOT_FOUND = { error: "That isn't here.", code: 'not_found' }

export async function handleApi(request, env) {
  const url = new URL(request.url)
  const hit = ROUTES.map((r) => ({ r, m: r.re.exec(url.pathname) })).filter((x) => x.m)
  const match = hit.find((x) => x.r.method === request.method)
  if (!match || (match.r.auth === 'test' && !testMode(env))) return json(NOT_FOUND, 404)
  const now = clockNow(request, env)
  const c = { request, env, url, db: env.DB, now, nowIso: now.toISOString(), today: localDate(now) }
  const params = Object.fromEntries(Object.entries(match.m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]))
  try {
    if (match.r.auth === 'family') await requireFamily(c)
    if (match.r.auth === 'staff') await requireStaff(c, url.pathname.split('/')[2])
    return await match.r.fn(c, params)
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message, code: e.code, ...e.extra }, e.status)
    console.error(e)
    return json({ error: "Something went wrong on the school's server. Try again.", code: 'server_error' }, 500)
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api' || pathname.startsWith('/api/')) return handleApi(request, env)
    return env.ASSETS.fetch(request)
  },

  // Daily: expired sessions and wrong-try records older than a day.
  async scheduled(event, env) {
    const nowIso = new Date().toISOString()
    const dayAgo = new Date(Date.now() - 24 * 3600e3).toISOString()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowIso),
      env.DB.prepare('DELETE FROM pin_attempts WHERE at < ?').bind(dayAgo),
      env.DB.prepare('DELETE FROM code_attempts WHERE at < ?').bind(dayAgo),
    ])
  },
}
