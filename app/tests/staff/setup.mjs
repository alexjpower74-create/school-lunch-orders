// Shared setup for the staff specs (sl2). Orders go in through the API; the pages are what the specs test.
// The numbers below are worked out by hand from the SAMPLE seed in docs/API.md, not read back from the Worker.
import { expect } from '@playwright/test'
import { api, bearer, CODE, familyToken, NOW, PIN, placeOrderViaApi, staffToken } from '../helpers.mjs'

export const THU = '2026-09-17'
export const FRI = '2026-09-18'

// Thu Sep 17 menu (Tue/Thu items + every-day items): chili, mac, milk, apple, cookie.
//   fam-1  Liam  mac ×1 (milk allergy, acknowledged)          400
//          Ava   mac ×1, apple ×2                              400 + 250
//   fam-2  Noah  chili ×1, apple ×1 (peanuts, tree nuts on file) 475 + 125
//   fam-3  Jack  mac ×1, milk ×2                               400 + 200
//          Chloe chili ×1 (eggs, sesame on file)               475
//          Emma  apple ×1 (gluten on file)                     125
//   fam-4  Owen  chili ×1, cookie ×1                           475 + 100
export const EXPECT_ITEMS = { mac: 3, apple: 4, chili: 3, milk: 2, cookie: 1 }
export const EXPECT_CLASSES = { 'room-k': 2, 'room-1': 1, 'room-2': 4, 'room-4': 2, 'room-5': 3, 'room-6': 1 }
export const EXPECT_ITEM_COUNT = 13
export const EXPECT_LINES = 11
export const EXPECT_CREDIT = { 'fam-1': 1050, 'fam-2': 600, 'fam-3': 1200, 'fam-4': 575 }
export const EXPECT_CREDIT_TOTAL = 3425

export async function orderThursday(request) {
  const place = async (code, lines) =>
    placeOrderViaApi(
      request,
      await familyToken(request, code),
      lines.map(([child_id, item_id, qty, ack]) => ({ child_id, date: THU, item_id, qty, ...(ack ? { allergen_ack: true } : {}) })),
    )
  await place(CODE.liamAva, [
    ['ch-liam', 'mac', 1, true],
    ['ch-ava', 'mac', 1],
    ['ch-ava', 'apple', 2],
  ])
  await place(CODE.noah, [
    ['ch-noah', 'chili', 1],
    ['ch-noah', 'apple', 1],
  ])
  await place(CODE.emmaJackChloe, [
    ['ch-jack', 'mac', 1],
    ['ch-jack', 'milk', 2],
    ['ch-chloe', 'chili', 1],
    ['ch-emma', 'apple', 1],
  ])
  await place(CODE.owen, [
    ['ch-owen', 'chili', 1],
    ['ch-owen', 'cookie', 1],
  ])
}

/** GET a staff route as the office (setup and cross-checks only). */
export async function staffGet(request, path, { pin = PIN.admin, now = NOW } = {}) {
  const token = await staffToken(request, pin, { now })
  const r = await api(request, 'GET', path, undefined, bearer(token), { now })
  expect(r.status, `GET ${path}: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body
}

export async function balancesViaApi(request, opts) {
  const { families } = await staffGet(request, '/api/office/families', opts)
  return Object.fromEntries(families.map((f) => [f.id, f.balance_cents]))
}
