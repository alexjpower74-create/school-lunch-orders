// "/" Sign in with the family code, typed the way a parent would; a wrong code; sign out.
import { expect, test } from '@playwright/test'
import { SCHOOL, assertNoThirdParty, fresh, tap, type } from '../helpers.mjs'

test.beforeEach(async ({ context, request }) => fresh(context, request))

test('sign in by typing KQ7M-4RTX lands on the family home; sign out goes back to sign-in', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.locator('#school-name')).toHaveText(SCHOOL)
  await expect(page.locator('.sample-badge')).toBeVisible()
  await expect(page.getByText('The school gives each family a code on paper. Lost it? Ask the office.')).toBeVisible()
  await type(page, page.locator('#code'), 'KQ7M-4RTX')
  await expect(page.locator('#code')).toHaveValue('KQ7M-4RTX')
  await tap(page, page.locator('#sign-in'), 'Sign in')
  await expect(page).toHaveURL(/\/family\/$/)
  await expect(page.locator('#family-label')).toHaveText('Liam and Ava')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('school-lunch:family')))
  expect(stored.family.id).toBe('fam-1')
  expect(stored.token).toHaveLength(43)

  await tap(page, page.locator('#sign-out'), 'Sign out')
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
  expect(await page.evaluate(() => localStorage.getItem('school-lunch:family'))).toBeNull()
  await page.goto('/family/')
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/, { timeout: 8000 })
  assertNoThirdParty(context)
})

test('lower case and without the dash: kq7m4rtx shows as KQ7M-4RTX and signs in', async ({ page }) => {
  await page.goto('/')
  await type(page, page.locator('#code'), 'kq7m4rtx')
  await expect(page.locator('#code')).toHaveValue('KQ7M-4RTX')
  await tap(page, page.locator('#sign-in'), 'Sign in')
  await expect(page.locator('#family-label')).toHaveText('Liam and Ava')
})

test('a wrong code shows #code-error and stays on sign-in', async ({ page }) => {
  await page.goto('/')
  await tap(page, page.locator('#sign-in'), 'Sign in with nothing typed')
  await expect(page.locator('#code-error')).toHaveText('Type your family code. It is on the paper from the school.')
  await type(page, page.locator('#code'), 'KQ7M-4RTY')
  await tap(page, page.locator('#sign-in'), 'Sign in')
  await expect(page.locator('#code-error')).toHaveText(
    "That family code doesn't match. Check the paper from the school, or ask the office.",
  )
  await expect(page.locator('#code-error')).toHaveAttribute('role', 'alert')
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
  expect(await page.evaluate(() => localStorage.getItem('school-lunch:family'))).toBeNull()
})
