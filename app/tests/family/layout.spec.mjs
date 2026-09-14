// Tap targets hit-tested with elementFromPoint (48 px, 56 px for the steppers, "I understand" and Place order), the last item's
// stepper clear of the cart bar, no sideways scroll, and screenshots of every parent page.
import { expect, test } from '@playwright/test'
import {
  CODE, PIN, expectNoHorizontalScroll, expectTapTarget, fresh, noSchoolViaApi, paymentViaApi, placeOrderViaApi, shot, staffToken, tap,
  useFamilySession,
} from '../helpers.mjs'

test.beforeEach(async ({ context, request }) => fresh(context, request))

async function all(page, selector, min, label) {
  await expect(page.locator(selector).first(), `${label}: shown`).toBeVisible()
  const n = await page.locator(selector).count()
  expect(n, `${label}: how many`).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) await expectTapTarget(page, page.locator(selector).nth(i), min, `${label} #${i + 1}`)
}

test('order page: tap targets, and the last item\'s stepper is not covered by #cart-bar at the bottom of the page', async ({ page, context, request }) => {
  await useFamilySession(context, request, CODE.liamAva)
  await page.goto('/family/order/')
  await tap(page, page.locator('button.day[data-date="2026-09-17"]'), 'Thu Sep 17')
  await tap(page, page.locator('button.child-tab[data-child="ch-liam"]'), 'Liam')
  await expect(page.locator('#cart-bar')).toBeVisible()
  await all(page, 'button.child-tab', 48, 'child tab')
  await all(page, 'button.day', 48, 'day chip')
  await expectTapTarget(page, page.locator('#prev-week'), 48, 'prev week')
  await expectTapTarget(page, page.locator('#next-week'), 48, 'next week')
  await expectTapTarget(page, page.locator('.item[data-item="mac"] button.ack'), 56, 'I understand, add it')
  await all(page, '.item .qty-plus', 56, 'plus')
  await all(page, '.item .qty-minus', 56, 'minus')
  await expectTapTarget(page, page.locator('#view-cart'), 56, 'View cart')

  // Scroll to the very bottom with real input, then hit-test the last item's stepper where it sits (no scrolling it into view).
  // The last card's own action: + for most items, "I understand, add it" when it holds one of Liam's allergens (both are 56 px).
  const last = page.locator('.item').last().locator('.item-actions button').last()
  const atBottom = () => page.evaluate(() => Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2)
  const { width, height } = page.viewportSize()
  await page.mouse.move(width / 2, height / 3)
  await page.mouse.wheel(0, 6000).catch(() => {}) // mobile WebKit has no wheel: the End key below does the same
  for (let i = 0; i < 4 && !(await atBottom()); i++) await page.keyboard.press('End')
  await expect.poll(atBottom, { message: 'scrolled to the bottom' }).toBe(true)
  const box = await last.boundingBox()
  const hit = await last.evaluate((el, [x, y]) => {
    const t = document.elementFromPoint(x, y)
    return t === el || el.contains(t) ? '' : t ? t.outerHTML.slice(0, 120) : 'nothing'
  }, [box.x + box.width / 2, box.y + box.height / 2])
  expect(hit, "the last item's + at the bottom of the page: something is on top").toBe('')
  expect(box.height).toBeGreaterThanOrEqual(56)
  // The bar itself: what you hit at its centre is the bar, the last item's action sits wholly above it, and nothing reads
  // through it (a solid background, or a real backdrop blur).
  const bar = page.locator('#cart-bar')
  const barBox = await bar.boundingBox()
  expect(await bar.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x, y)), [barBox.x + barBox.width / 2, barBox.y + barBox.height / 2]),
    'elementFromPoint at the bar centre is inside #cart-bar').toBe(true)
  expect(box.y + box.height, "the last item's action is fully above the bar").toBeLessThanOrEqual(barBox.y)
  const look = await bar.evaluate((el) => {
    const cs = getComputedStyle(el)
    const parts = (cs.backgroundColor.match(/[\d.]+/g) || []).map(Number)
    return { alpha: parts.length >= 4 ? parts[3] : parts.length === 3 ? 1 : 0, blur: /blur/.test(cs.backdropFilter || cs.webkitBackdropFilter || '') }
  })
  expect(look.alpha === 1 || look.blur, `cart bar background is solid (alpha ${look.alpha}) or blurred`).toBe(true)
  await expectTapTarget(page, page.locator('.item summary').first(), 48, 'Ingredients')
  await expectNoHorizontalScroll(page)
})

test('tap targets and no sideways scroll on sign-in, home, children, cart and history', async ({ page, context, request }) => {
  await page.goto('/')
  await expectTapTarget(page, page.locator('#code'), 48, 'family code')
  await expectTapTarget(page, page.locator('#sign-in'), 48, 'Sign in')
  await expectNoHorizontalScroll(page)

  const s = await useFamilySession(context, request, CODE.liamAva)
  await placeOrderViaApi(request, s.token, [{ child_id: 'ch-liam', date: '2026-09-17', item_id: 'mac', qty: 1, allergen_ack: true }])
  await page.goto('/family/')
  for (const id of ['#order-lunches', '#add-child', '#history-link', '#sign-out']) await expectTapTarget(page, page.locator(id), 48, id)
  await all(page, 'button.cancel-line', 48, 'Cancel')
  await expectNoHorizontalScroll(page)

  await page.goto('/family/children/')
  await all(page, 'button.edit-child', 48, 'Edit')
  await all(page, 'button.remove-child', 48, 'Remove')
  await expectTapTarget(page, page.locator('#first-name'), 48, 'first name')
  await expectTapTarget(page, page.locator('#class'), 48, 'class')
  await all(page, 'input[name="allergy"]', 48, 'allergy row')
  await expectTapTarget(page, page.locator('#save-child'), 48, 'Save')
  await expectNoHorizontalScroll(page)

  await page.goto('/family/order/')
  await tap(page, page.locator('button.day[data-date="2026-09-17"]'), 'Thu Sep 17')
  await tap(page, page.locator('.item[data-item="apple"] .qty-plus'), 'Ava + apple')
  await tap(page, page.locator('#view-cart'), 'View cart')
  await expect(page.locator('.cart-line')).toHaveCount(1)
  await all(page, 'button.remove-line', 48, 'Remove line')
  await expectTapTarget(page, page.locator('#place-order'), 56, 'Place order')
  await expectNoHorizontalScroll(page)

  await page.goto('/family/history/')
  await expect(page.locator('.entry')).toHaveCount(1)
  await expectNoHorizontalScroll(page)
})

test('screenshots of every parent page', async ({ page, context, request }, testInfo) => {
  await page.goto('/')
  await expect(page.locator('#school-name')).toBeVisible()
  await shot(page, testInfo, 'family', 'signin')

  const s = await useFamilySession(context, request, CODE.liamAva)
  const office = await staffToken(request, PIN.admin)
  await placeOrderViaApi(request, s.token, [
    { child_id: 'ch-liam', date: '2026-09-17', item_id: 'mac', qty: 1, allergen_ack: true },
    { child_id: 'ch-ava', date: '2026-09-17', item_id: 'chili', qty: 1 },
    { child_id: 'ch-ava', date: '2026-09-18', item_id: 'pizza', qty: 2 },
    { child_id: 'ch-liam', date: '2026-09-21', item_id: 'soup', qty: 1 },
  ])
  await paymentViaApi(request, office, { family_id: 'fam-1', amount_cents: 500, method: 'etransfer' })
  await noSchoolViaApi(request, office, { date: '2026-09-21', kind: 'closure', note: 'Storm (SAMPLE)' })

  await page.goto('/family/')
  await expect(page.locator('#upcoming .line').first()).toBeVisible()
  await shot(page, testInfo, 'family', 'home')

  await page.goto('/family/children/')
  await expect(page.locator('.child-row')).toHaveCount(2)
  await shot(page, testInfo, 'family', 'children')

  await page.goto('/family/order/')
  await tap(page, page.locator('button.day[data-date="2026-09-17"]'), 'Thu Sep 17')
  await tap(page, page.locator('button.child-tab[data-child="ch-liam"]'), 'Liam')
  await tap(page, page.locator('.item[data-item="apple"] .qty-plus'), 'Liam + apple')
  await page.locator('.item[data-item="mac"]').scrollIntoViewIfNeeded()
  await expect(page.locator('.item[data-item="mac"] .allergen-warning')).toBeVisible()
  await shot(page, testInfo, 'family', 'order-allergen-warning')
  await tap(page, page.locator('button.day[data-date="2026-09-16"]'), 'Wed Sep 16')
  await expect(page.locator('#day-status')).toHaveText('Ordering closed at 9:00 AM Tue Sep 15')
  await shot(page, testInfo, 'family', 'order-closed-day')

  await page.goto('/family/order/')
  await tap(page, page.locator('button.day[data-date="2026-09-17"]'), 'Thu Sep 17')
  await tap(page, page.locator('button.child-tab[data-child="ch-liam"]'), 'Liam')
  await tap(page, page.locator('.item[data-item="cookie"] button.ack'), 'Liam + cookie, I understand')
  await tap(page, page.locator('#view-cart'), 'View cart')
  await expect(page.locator('.cart-line')).toHaveCount(2)
  await shot(page, testInfo, 'family', 'cart')
  await tap(page, page.locator('#place-order'), 'Place order')
  await expect(page.locator('#order-placed')).toBeVisible()
  await shot(page, testInfo, 'family', 'order-placed')

  await page.goto('/family/history/')
  await expect(page.locator('.entry[data-kind="closure"]')).toBeVisible()
  await shot(page, testInfo, 'family', 'history')
})
