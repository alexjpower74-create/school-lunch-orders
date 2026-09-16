// The cross-slice journey (lead-owned). One school day, four people on their own devices, real input only:
//   a parent orders on a phone (Liam's milk allergy needs "I understand", Ava's doesn't) → the office records the e-Transfer →
//   the kitchen's totals and flagged row on a laptop → a storm closure added in settings on the morning → the parent's credit to
//   the cent → the teacher's list for that day is empty → the kitchen shows no school.
// Runs once per engine (the -1280 projects); the parent and the teacher use 390-wide phone contexts inside it.
import { expect, test } from '@playwright/test'
import {
  api,
  assertNoThirdParty,
  bearer,
  CODE,
  fresh,
  keypad,
  newContext,
  nl,
  PIN,
  placeOrderViaApi,
  familyToken,
  paymentViaApi,
  setNow,
  shot,
  staffToken,
  tap,
  type,
} from '../helpers.mjs'

const THU = '2026-09-17'
const WED_10AM = nl('2026-09-16', '10:00') // after Thursday's cut-off: the kitchen's numbers are final
const THU_7AM = nl('2026-09-17', '07:00') // the storm, on the morning
const THU_730 = nl('2026-09-17', '07:30')
const THU_NOON = nl('2026-09-17', '12:00')

// Worked out by hand from docs/API.md's SAMPLE seed, not read back from the Worker.
//   fam-1 (by the parent's own taps)  Liam  Macaroni and cheese ×1 (milk: "I understand") 4.00, Apple slices ×1 1.25
//                                     Ava   Macaroni and cheese ×1                            4.00   → $9.25
//   fam-3 (API)                       Jack  Macaroni and cheese ×1 4.00, White milk ×2 2.00      → $6.00
//   fam-2 (API)                       Noah  Beef chili with rice ×1 (peanuts, tree nuts on file) → $4.75
const PARENT_TOTAL = '$9.25'
const ITEMS = { mac: 3, apple: 1, milk: 2, chili: 1 }
const ITEM_COUNT = 7
const CREDIT = { 'fam-1': 925, 'fam-3': 600, 'fam-2': 475 }

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires the fixtures object destructuring pattern here
test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name.endsWith('-390'),
    'The journey runs once per engine; its phones are 390-wide contexts inside the 1280 project.',
  )
})

async function staffSignIn(page, pin, landing) {
  await page.goto('/staff/')
  await keypad(page, pin, page.locator('#pin-submit'))
  await expect(page).toHaveURL(new RegExp(`${landing}$`))
}

test('a parent orders, the kitchen sees it, a storm closure credits it to the cent, the teacher and kitchen see no school', async ({
  browser,
  context,
  request,
}, testInfo) => {
  test.setTimeout(180_000)
  await fresh(context, request)

  // ---- the parent's phone, Tue Sep 15 at 11:00 AM ----
  const parent = await newContext(browser, 'phone')
  const p = await parent.newPage()
  await p.goto('/')
  await type(p, p.locator('#code'), 'kq7m4rtx')
  await tap(p, p.locator('#sign-in'), 'sign in')
  await expect(p).toHaveURL(/\/family\/$/)
  await tap(p, p.locator('#order-lunches'), 'order lunches')
  await expect(p).toHaveURL(/\/family\/order\//)

  await tap(p, p.locator('button.child-tab[data-child="ch-liam"]'), 'Liam tab')
  await tap(p, p.locator(`button.day[data-date="${THU}"]`), 'Thu Sep 17')
  const liamMac = p.locator('.item[data-item="mac"]')
  await expect(liamMac, "Liam's Macaroni and cheese is flagged").toHaveAttribute('data-conflict', 'true')
  await expect(liamMac.locator('.allergen-warning')).toContainText('Liam')
  await expect(liamMac.locator('.allergen-warning')).toContainText('Milk')
  await expect(liamMac.locator('.qty-plus'), 'no plain + for a conflicting item').toHaveCount(0)
  await tap(p, liamMac.locator('button.ack'), 'I understand, add it')
  await expect(liamMac.locator('.qty')).toHaveText('1')
  await tap(p, p.locator('.item[data-item="apple"] button.qty-plus'), 'apple +')

  await tap(p, p.locator('button.child-tab[data-child="ch-ava"]'), 'Ava tab')
  const avaMac = p.locator('.item[data-item="mac"]')
  await expect(avaMac, "Ava's Macaroni and cheese is not flagged").not.toHaveAttribute('data-conflict', 'true')
  await expect(avaMac.locator('.allergen-warning')).toHaveCount(0)
  await tap(p, avaMac.locator('button.qty-plus'), 'Ava mac +')
  await expect(p.locator('#cart-total')).toHaveText(PARENT_TOTAL)
  await shot(p, testInfo, 'journey', '1-parent-order')

  await tap(p, p.locator('#view-cart'), 'view cart')
  await expect(p).toHaveURL(/\/family\/cart\//)
  await expect(p.locator(`.cart-line[data-child="ch-liam"][data-date="${THU}"][data-item="mac"] input.ack-check`)).toBeChecked()
  await expect(p.locator(`.cart-line[data-child="ch-ava"][data-date="${THU}"][data-item="mac"] input.ack-check`)).toHaveCount(0)
  await tap(p, p.locator('#place-order'), 'place order')
  await expect(p.locator('#order-placed')).toBeVisible()
  await expect(p.locator('#placed-total')).toHaveText(PARENT_TOTAL)
  await shot(p, testInfo, 'journey', '2-parent-placed')

  // ---- other families (setup) and the office recording fam-1's e-Transfer ----
  await placeOrderViaApi(request, await familyToken(request, CODE.emmaJackChloe), [
    { child_id: 'ch-jack', date: THU, item_id: 'mac', qty: 1 },
    { child_id: 'ch-jack', date: THU, item_id: 'milk', qty: 2 },
  ])
  await placeOrderViaApi(request, await familyToken(request, CODE.noah), [{ child_id: 'ch-noah', date: THU, item_id: 'chili', qty: 1 }])
  const fam1Lines = (await api(request, 'GET', '/api/family/orders', undefined, bearer(await familyToken(request, CODE.liamAva)))).body
    .lines
  expect(
    fam1Lines.find((l) => l.child_id === 'ch-liam' && l.item_id === 'mac')?.ack_allergens,
    "Liam's acknowledgement was stored",
  ).toEqual(['milk'])
  expect(fam1Lines.find((l) => l.child_id === 'ch-ava' && l.item_id === 'mac')?.ack_allergens, 'Ava needed none').toEqual([])
  await paymentViaApi(request, await staffToken(request, PIN.admin), { family_id: 'fam-1', amount_cents: 925, method: 'etransfer' })

  // ---- the kitchen's laptop, Wed Sep 16 at 10:00 AM: Thursday is the next school day and its orders are closed ----
  const kitchen = await newContext(browser, 'desktop', { now: WED_10AM })
  const k = await kitchen.newPage()
  await staffSignIn(k, PIN.kitchen, '/kitchen/')
  await expect(k.locator('#kitchen-date')).toHaveText('Thursday, September 17')
  await expect(k.locator('#orders-open')).toBeHidden()
  for (const [item, qty] of Object.entries(ITEMS)) {
    await expect(k.locator(`#item-totals tr[data-item="${item}"] .qty`), `kitchen ${item}`).toHaveText(String(qty))
  }
  await expect(k.locator('#stat-items')).toHaveText(String(ITEM_COUNT))
  const rows = k.locator('#children tr.child-row')
  await expect(rows.nth(0)).toHaveAttribute('data-child', 'ch-liam')
  await expect(rows.nth(0)).toHaveAttribute('data-flag', 'conflict')
  await expect(rows.nth(0)).toContainText('Milk in Macaroni and cheese')
  await expect(rows.nth(1)).toHaveAttribute('data-child', 'ch-noah')
  await expect(rows.nth(1)).toHaveAttribute('data-flag', 'allergy')
  await shot(k, testInfo, 'journey', '3-kitchen')

  // ---- the office on Thu Sep 17 at 7:00 AM: a storm, added through settings ----
  const office = await newContext(browser, 'desktop', { now: THU_7AM })
  const o = await office.newPage()
  await staffSignIn(o, PIN.admin, '/office/')
  await tap(o, o.locator('nav#staff-nav a[data-nav="admin"]'), 'Settings')
  await expect(o).toHaveURL(/\/admin\//)
  await tap(o, o.locator('button.tab[data-tab="days"]'), 'No-school days tab')
  await expect(o.locator('#no-school-date'), 'the date starts at today').toHaveValue(THU)
  await expect(o.locator('#no-school-kind')).toHaveValue('closure')
  await type(o, o.locator('#no-school-note'), 'Storm closure (SAMPLE)')
  await tap(o, o.locator('#add-no-school'), 'Add')
  await expect(o.locator('#no-school-preview')).toHaveText('This cancels 7 items for 3 families and credits $20.00 to their balances.')
  await tap(o, o.locator('#confirm-no-school'), 'Yes, add the no-school day')
  await expect(o.locator('#no-school-result')).toHaveText(
    'Thu Sep 17 is now a no-school day. Cancelled 7 items for 3 families. Credited $20.00.',
  )
  await shot(o, testInfo, 'journey', '4-closure')

  const admin = await staffToken(request, PIN.admin, { now: THU_7AM })
  const { families } = (await api(request, 'GET', '/api/office/families', undefined, bearer(admin), { now: THU_7AM })).body
  const balance = Object.fromEntries(families.map((f) => [f.id, f.balance_cents]))
  expect(balance, 'each family credited exactly its own Thursday total').toMatchObject({
    'fam-1': 925 - 925 - CREDIT['fam-1'],
    'fam-3': 600 - CREDIT['fam-3'],
    'fam-2': 475 - CREDIT['fam-2'],
  })

  // ---- the parent's phone at 7:30 AM: the credit, to the cent ----
  await setNow(parent, THU_730)
  await p.goto('/family/')
  await expect(p.locator('#balance-text')).toHaveText('You have a $9.25 credit')
  await expect(p.locator('#balance')).toHaveAttribute('data-balance-cents', '-925')
  await p.goto('/family/history/')
  await expect(p.locator('#ledger .entry[data-kind="closure"]')).toContainText('Credit: School closed Thu Sep 17')
  await shot(p, testInfo, 'journey', '5-parent-credit')

  // ---- the teacher's phone at noon: nothing to hand out ----
  const teacher = await newContext(browser, 'phone', { now: THU_NOON })
  const t = await teacher.newPage()
  await staffSignIn(t, PIN.oldford, '/teacher/')
  await expect(t.locator('#teacher-note')).toBeVisible()
  await expect(t.locator('.child-row')).toHaveCount(0)
  await expect(t.locator('button.mark')).toHaveCount(0)
  await shot(t, testInfo, 'journey', '6-teacher')

  // ---- the kitchen on Thursday morning: yesterday's 12-hour session has ended, so it signs in again; no school, nothing to make ----
  await setNow(kitchen, THU_7AM)
  await k.goto(`/kitchen/?date=${THU}`)
  await expect(k, 'the kitchen session from Wed 10:00 AM has ended by Thu 7:00 AM').toHaveURL(/\/staff\//)
  await keypad(k, PIN.kitchen, k.locator('#pin-submit'))
  await expect(k).toHaveURL(/\/kitchen\//)
  await k.goto(`/kitchen/?date=${THU}`)
  await expect(k.locator('#no-school')).toBeVisible()
  await expect(k.locator('#stat-items')).toHaveText('0')
  await expect(k.locator('#children tr.child-row')).toHaveCount(0)

  for (const c of [context, parent, kitchen, office, teacher]) assertNoThirdParty(c)
  await Promise.all([parent, kitchen, office, teacher].map((c) => c.close()))
})
