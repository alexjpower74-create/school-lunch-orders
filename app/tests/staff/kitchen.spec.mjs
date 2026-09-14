// Kitchen day page and labels: totals equal the orders, allergy rows first, the cut-off banner, print.
import { expect, test } from '@playwright/test'
import {
  assertNoThirdParty, contrastOf, expectNoHorizontalScroll, expectTapTarget, fresh, kitchenDayViaApi, nl, PIN, setNow, shot, staffToken, tap,
  useStaffSession,
} from '../helpers.mjs'
import { EXPECT_CLASSES, EXPECT_ITEM_COUNT, EXPECT_ITEMS, EXPECT_LINES, orderThursday, THU } from './setup.mjs'

test.beforeEach(async ({ context, request }) => {
  await fresh(context, request)
  await orderThursday(request)
})
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

/** Open the kitchen and pick Thu Sep 17 (a date input: hit-tested, then fill, per PLAN's input exceptions). */
async function openThursday(page) {
  await page.goto('/kitchen/')
  await expect(page.locator('#kitchen-date')).not.toHaveText('Loading…')
  await expectTapTarget(page, page.locator('#date-pick'), 44, 'date picker')
  await page.locator('#date-pick').fill(THU)
  await expect(page.locator('#kitchen-date')).toHaveText('Thursday, September 17')
  // Tap the heading so Chromium's highlighted date segment is not in the screenshots. (A touch tap on text does not move focus
  // in WebKit, so focus itself is not asserted.)
  await tap(page, page.locator('.page-head h1'), 'kitchen heading')
}
const qtyByKey = (rows, key) => rows.evaluateAll((rs, k) => Object.fromEntries(rs.map((r) => [r.dataset[k], Number(r.querySelector('.qty').textContent)])), key)

test('kitchen totals equal the orders', async ({ page, context, request }) => {
  await useStaffSession(context, request, PIN.kitchen)
  const apiDay = await kitchenDayViaApi(request, await staffToken(request, PIN.kitchen), THU)
  await openThursday(page)

  await expect(page.locator('#item-totals tr[data-item]')).toHaveCount(Object.keys(EXPECT_ITEMS).length)
  const items = await qtyByKey(page.locator('#item-totals tr[data-item]'), 'item')
  expect(items, 'item totals on the page = the hand-computed numbers').toEqual(EXPECT_ITEMS)
  expect(Object.fromEntries(apiDay.items.map((i) => [i.item_id, i.qty])), 'item totals from the API = the hand-computed numbers').toEqual(EXPECT_ITEMS)

  await expect(page.locator('#class-totals tr[data-class]')).toHaveCount(Object.keys(EXPECT_CLASSES).length)
  const classes = await qtyByKey(page.locator('#class-totals tr[data-class]'), 'class')
  expect(classes, 'class totals on the page = the hand-computed numbers').toEqual(EXPECT_CLASSES)
  expect(Object.fromEntries(apiDay.classes.map((c) => [c.class_id, c.qty])), 'class totals from the API').toEqual(EXPECT_CLASSES)

  await expect(page.locator('#stat-items')).toHaveText(String(EXPECT_ITEM_COUNT))
  await expect(page.locator('#stat-children')).toHaveText('7')
  expect(apiDay.totals).toMatchObject({ item_count: EXPECT_ITEM_COUNT, line_count: EXPECT_LINES, children: 7 })
})

test('allergy rows come first with the red edge', async ({ page, context, request }) => {
  await useStaffSession(context, request, PIN.kitchen)
  const apiDay = await kitchenDayViaApi(request, await staffToken(request, PIN.kitchen), THU)
  await openThursday(page)
  const rows = page.locator('#children tr.child-row')
  await expect(rows).toHaveCount(7)
  const order = await rows.evaluateAll((rs) => rs.map((r) => [r.dataset.child, r.dataset.flag]))
  expect(order.slice(0, 2), 'children order: Liam (conflict) first, Noah (allergy on file) next').toEqual([['ch-liam', 'conflict'], ['ch-noah', 'allergy']])
  const rank = { conflict: 0, allergy: 1, none: 2 }
  const ranks = order.map(([, f]) => rank[f])
  expect(ranks, 'children order: every conflict row, then every allergy row, then the rest').toEqual([...ranks].sort((a, b) => a - b))
  expect(order.map(([id]) => id), 'children order matches the API').toEqual(apiDay.children.map((c) => c.child_id))

  const liam = page.locator('#children tr.child-row[data-child="ch-liam"]')
  await expect(liam).toContainText('ALLERGY')
  await expect(liam).toContainText('Milk in Macaroni and cheese')
  await expect(liam).not.toContainText('Not confirmed by the parent')
  const edge = (loc) => loc.evaluate((r) => { const cs = getComputedStyle(r); return `${cs.borderLeftStyle} ${cs.borderLeftWidth} ${cs.borderLeftColor}` })
  expect(await edge(liam), "Liam's red edge (--allergen)").toBe('solid 6px rgb(248, 113, 113)')
  expect(await edge(page.locator('#children tr.child-row[data-child="ch-jack"]')), 'no red edge on a row without allergies').not.toContain('248, 113, 113')
  expect(await contrastOf(liam.locator('.pill-allergy')), 'ALLERGY pill contrast').toBeGreaterThanOrEqual(4.5)
  await expect(page.locator('#children tr.child-row[data-child="ch-noah"]')).toContainText('Peanuts and Tree nuts')
})

test('orders-open shows before the cut-off and not after', async ({ page, context, request }) => {
  // Signed in with the later clock so the 12-hour session is still good once the clock moves to Wed 9:00 AM.
  await useStaffSession(context, request, PIN.kitchen, { now: nl('2026-09-16', '08:00') })
  await openThursday(page)
  await expect(page.locator('#orders-open')).toBeVisible()
  await expect(page.locator('#orders-open')).toHaveText('Orders are still open until 9:00 AM Wed Sep 16. These numbers can still change.')
  await setNow(context, nl('2026-09-16', '09:00'))
  await page.reload()
  await expect(page.locator('#kitchen-date')).toHaveText('Thursday, September 17')
  await expect(page.locator('#stat-items')).toHaveText(String(EXPECT_ITEM_COUNT))
  await expect(page.locator('#orders-open')).toBeHidden()
})

test('kitchen tap targets, no sideways scroll, screenshots', async ({ page, context, request }, testInfo) => {
  await useStaffSession(context, request, PIN.kitchen)
  await openThursday(page)
  await expect(page.locator('#children tr.child-row')).toHaveCount(7)
  for (const sel of ['#date-next', '#date-today', '#date-pick', '#print-labels', '#staff-sign-out', 'nav#staff-nav a[data-nav="kitchen"]']) {
    await expectTapTarget(page, page.locator(sel), 44, sel)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await expectNoHorizontalScroll(page)
  await shot(page, testInfo, 'staff', 'kitchen')
  await tap(page, page.locator('#date-next'), 'next school day')
  await expect(page.locator('#kitchen-date')).toHaveText('Wednesday, September 16')
  await expect(page.locator('#date-next')).toHaveAttribute('aria-pressed', 'true')
})

test("one label per active line and Liam's names Milk", async ({ page, context, request }, testInfo) => {
  await useStaffSession(context, request, PIN.kitchen)
  const { labels } = await (async () => {
    const r = await request.get(`/api/kitchen/labels?date=${THU}`, { headers: { Authorization: `Bearer ${await staffToken(request, PIN.kitchen)}`, 'X-Test-Now': '2026-09-15T13:30:00Z' } })
    expect(r.status()).toBe(200)
    return r.json()
  })()
  expect(labels.length, 'labels from the API = active lines').toBe(EXPECT_LINES)
  await openThursday(page)
  await tap(page, page.locator('#print-labels'), 'print labels')
  await expect(page).toHaveURL(new RegExp(`/kitchen/labels/\\?date=${THU}$`))
  await expect(page.locator('.label')).toHaveCount(EXPECT_LINES)

  const liamMac = labels.find((l) => l.first_name === 'Liam' && l.item_name === 'Macaroni and cheese')
  await expect(page.locator(`.label[data-line="${liamMac.line_id}"] .label-allergen`), "Liam's label-allergen").toHaveText('ALLERGY: Milk. Contains Milk.')
  const avaMac = labels.find((l) => l.first_name === 'Ava' && l.item_name === 'Macaroni and cheese')
  await expect(page.locator(`.label[data-line="${avaMac.line_id}"]`)).toContainText('Macaroni and cheese ×1')
  await expect(page.locator(`.label[data-line="${avaMac.line_id}"] .label-allergen`)).toHaveCount(0)
  await expect(page.locator('.label .label-allergen'), 'one allergen line per conflicting label').toHaveCount(labels.filter((l) => l.conflicts.length).length)
  const noah = labels.find((l) => l.first_name === 'Noah' && l.item_name === 'Beef chili with rice')
  await expect(page.locator(`.label[data-line="${noah.line_id}"] .label-allergies`)).toHaveText('Allergies on file: Peanuts and Tree nuts')
  if (testInfo.project.name.endsWith('1280')) await shot(page, testInfo, 'staff', 'labels')
})

test('print emulation gives a white sheet and hides buttons', async ({ page, context, request }) => {
  await useStaffSession(context, request, PIN.kitchen)
  await page.goto(`/kitchen/labels/?date=${THU}`)
  await expect(page.locator('.label')).toHaveCount(EXPECT_LINES)
  await expect(page.locator('#print')).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'print background').toBe('rgb(255, 255, 255)')
  await expect(page.locator('#print')).toBeHidden()
  await expect(page.locator('[data-sticky-header]')).toBeHidden()
  const allergen = page.locator('.label-allergen').first()
  await expect(allergen).toBeVisible()
  const style = await allergen.evaluate((el) => { const cs = getComputedStyle(el); return { weight: Number(cs.fontWeight), border: parseFloat(cs.borderTopWidth), color: cs.color } })
  expect(style.weight, 'allergen line bold in print').toBeGreaterThanOrEqual(700)
  expect(style.border, 'allergen line has a border in print').toBeGreaterThan(0)
  expect(style.color, 'black ink').toBe('rgb(0, 0, 0)')
})
