// "/family/children/" Add a child with two allergies, edit, and a removal the Worker refuses while lunches are ordered.
import { expect, test } from '@playwright/test'
import { CODE, expectTapTarget, familyViaApi, fresh, placeOrderViaApi, tap, type, useFamilySession } from '../helpers.mjs'

test.beforeEach(async ({ context, request }) => fresh(context, request))

test('add a child with two allergies ticked, edit, and remove refused while lunches are ordered', async ({ page, context, request }) => {
  const s = await useFamilySession(context, request, CODE.owen)
  await page.goto('/family/children/')
  await expect(page.locator('.child-row')).toHaveCount(1)

  await tap(page, page.locator('#save-child'), 'Save with nothing typed')
  await expect(page.locator('.field-error[data-for="first_name"]')).toHaveText("Type your child's first name.")

  await type(page, page.locator('#first-name'), 'Mia')
  await expectTapTarget(page, page.locator('#class'), 48, 'class select')
  await page.locator('#class').selectOption('room-3')
  await tap(page, page.locator('input[name="allergy"][value="eggs"]'), 'Eggs')
  await tap(page, page.locator('input[name="allergy"][value="sesame"]'), 'Sesame seeds')
  await expect(page.locator('input[name="allergy"]:checked')).toHaveCount(2)
  await tap(page, page.locator('#save-child'), 'Save')

  const row = page.locator('.child-row', { hasText: 'Mia' })
  await expect(row).toBeVisible()
  await expect(row.locator('.where')).toHaveText('Room 5 · Grade 3')
  await expect(row.locator('.pill')).toHaveText(['Eggs', 'Sesame seeds'])
  await expect(page.locator('#child-saved')).toHaveText('Saved Mia.')
  let fam = await familyViaApi(request, s.token)
  const mia = fam.children.find((c) => c.first_name === 'Mia')
  expect(mia).toMatchObject({ class_id: 'room-3', allergies: ['eggs', 'sesame'] })

  await tap(page, page.locator(`.child-row[data-child="${mia.id}"] .edit-child`), 'Edit Mia')
  await expect(page.locator('#form-title')).toHaveText('Edit Mia')
  await expect(page.locator('#first-name')).toHaveValue('Mia')
  await type(page, page.locator('#first-name'), 'Mia-Rose', { clear: true })
  await tap(page, page.locator('input[name="allergy"][value="sesame"]'), 'untick Sesame seeds')
  await tap(page, page.locator('#save-child'), 'Save the edit')
  await expect(page.locator(`.child-row[data-child="${mia.id}"] h3`)).toHaveText('Mia-Rose')
  await expect(page.locator(`.child-row[data-child="${mia.id}"] .pill`)).toHaveText(['Eggs'])
  fam = await familyViaApi(request, s.token)
  expect(fam.children.find((c) => c.id === mia.id)).toMatchObject({ first_name: 'Mia-Rose', allergies: ['eggs'] })

  await placeOrderViaApi(request, s.token, [{ child_id: 'ch-owen', date: '2026-09-17', item_id: 'chili', qty: 1 }])
  const owen = page.locator('.child-row[data-child="ch-owen"]')
  await tap(page, owen.locator('.remove-child'), 'Remove Owen')
  await tap(page, owen.locator('.confirm-remove'), 'Yes, remove Owen')
  await expect(owen.locator('.row-error')).toHaveText('Owen has lunches ordered for days still to come. Cancel them first.')
  await expect(owen).toBeVisible()
  expect((await familyViaApi(request, s.token)).children.map((c) => c.id)).toContain('ch-owen')

  await tap(page, page.locator(`.child-row[data-child="${mia.id}"] .remove-child`), 'Remove Mia-Rose')
  await tap(page, page.locator(`.child-row[data-child="${mia.id}"] .confirm-remove`), 'Yes, remove Mia-Rose')
  await expect(page.locator(`.child-row[data-child="${mia.id}"]`)).toHaveCount(0)
  expect((await familyViaApi(request, s.token)).children.map((c) => c.id)).toEqual(['ch-owen'])
})
