// Staff PIN sign-in, role navigation and the "not for your PIN" screen. Real keypad taps.
import { expect, test } from '@playwright/test'
import { assertNoThirdParty, fresh, keypad, PIN, SCHOOL, shot, tap, useStaffSession } from '../helpers.mjs'

const ROLES = [
  { pin: PIN.admin, path: '/office/', nav: ['kitchen', 'teacher', 'office', 'admin'], name: 'Ms. Janes (SAMPLE)' },
  { pin: PIN.kitchen, path: '/kitchen/', nav: ['kitchen'], name: 'Mr. Kean (SAMPLE)' },
  { pin: PIN.oldford, path: '/teacher/', nav: ['teacher'], name: 'Ms. Oldford (SAMPLE)' },
]

test.beforeEach(async ({ context, request }) => { await fresh(context, request) })
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

test('PIN sign-in by keypad lands on the right page with the right nav', async ({ page }) => {
  for (const r of ROLES) {
    await page.goto('/staff/')
    await expect(page.locator('[data-sticky-header] .brand-name')).toHaveText(SCHOOL)
    await keypad(page, r.pin, page.locator('#pin-submit'))
    await expect(page, `PIN ${r.pin} lands on ${r.path}`).toHaveURL(new RegExp(`${r.path}(\\?|$)`))
    await expect(page.locator('[data-sticky-header] .staff-who')).toHaveText(r.name)
    await expect(page.locator('[data-sticky-header] .brand-name')).toHaveText(SCHOOL)
    await expect(page.locator('[data-sticky-header] .sample-badge')).toBeVisible()
    await expect(page.locator('nav#staff-nav a[data-nav]')).toHaveCount(r.nav.length)
    expect(await page.locator('nav#staff-nav a[data-nav]').evaluateAll((as) => as.map((a) => a.dataset.nav)), `nav for ${r.name}`).toEqual(r.nav)
    await expect(page.locator('#forbidden')).toHaveCount(0)
    await tap(page, page.locator('#staff-sign-out'), 'sign out')
    await expect(page).toHaveURL(/\/staff\/$/)
    expect(await page.evaluate(() => localStorage.getItem('school-lunch:staff')), 'session cleared on sign out').toBeNull()
  }
})

test('a wrong PIN shows the error', async ({ page }, testInfo) => {
  await page.goto('/staff/')
  await expect(page.locator('[data-sticky-header] .brand-name')).toHaveText(SCHOOL)
  await shot(page, testInfo, 'staff', 'pin')
  await keypad(page, '9090', page.locator('#pin-submit'))
  await expect(page.locator('#pin-error')).toHaveText('That PIN is not right.')
  await expect(page).toHaveURL(/\/staff\/$/)
  await expect(page.locator('#pin-dots .pin-dot.on')).toHaveCount(0)
})

test('a teacher opening the office sees that the page is not for their PIN', async ({ page, context, request }) => {
  await useStaffSession(context, request, PIN.oldford)
  await page.goto('/office/')
  await expect(page.locator('#forbidden')).toContainText('That page is not for your PIN.')
  await expect(page.locator('.family-row')).toHaveCount(0)
  await tap(page, page.locator('#forbidden-home'), 'go to the teacher page')
  await expect(page).toHaveURL(/\/teacher\/(\?|$)/)
})
