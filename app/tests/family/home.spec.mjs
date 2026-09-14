// "/family/" and "/family/history/": cancel before the cut-off, the balance in plain words, and a storm closure's credit.
import { expect, test } from '@playwright/test'
import {
  CODE, PIN, api, bearer, familyOrdersViaApi, fresh, kitchenDayViaApi, noSchoolViaApi, paymentViaApi, placeOrderViaApi, staffToken, tap, useFamilySession,
} from '../helpers.mjs'

test.beforeEach(async ({ context, request }) => fresh(context, request))

test('cancel before the cut-off: the line goes and #balance-text changes by exactly the line total; no Cancel after the cut-off', async ({ page, context, request }) => {
  const s = await useFamilySession(context, request, CODE.liamAva)
  await placeOrderViaApi(request, s.token, [{ child_id: 'ch-ava', date: '2026-09-16', item_id: 'apple', qty: 1 }], { now: '2026-09-15T11:00:00Z' })
  const placed = await placeOrderViaApi(request, s.token, [
    { child_id: 'ch-ava', date: '2026-09-17', item_id: 'chili', qty: 1 },
    { child_id: 'ch-liam', date: '2026-09-21', item_id: 'apple', qty: 2 },
  ])
  const chili = placed.order.lines.find((l) => l.item_id === 'chili')
  await page.goto('/family/')
  await expect(page.locator('#balance-text')).toHaveText('You owe $8.50')
  await expect(page.locator('#payment-instructions')).toContainText('Pay by Interac e-Transfer')
  const before = Number(await page.locator('#balance').getAttribute('data-balance-cents'))

  const wed = page.locator('#upcoming .line', { hasText: 'Apple slices ×1' })
  await expect(wed).toBeVisible()
  await expect(wed.locator('button.cancel-line'), 'no Cancel after the cut-off (Wed Sep 16)').toHaveCount(0)
  await expect(page.locator('#upcoming .day-group h3')).toHaveText(['Wed Sep 16', 'Thu Sep 17', 'Mon Sep 21'])

  const line = page.locator(`.line[data-line="${chili.id}"]`)
  await expect(line).toContainText('Ava, Beef chili with rice ×1')
  await expect(line).toContainText('$4.75')
  await tap(page, line.locator('button.cancel-line'), 'Cancel chili')
  await tap(page, line.locator('button.confirm-cancel'), 'Yes, cancel it')
  await expect(line).toHaveCount(0)
  await expect(page.locator('#balance-text')).toHaveText('You owe $3.75')
  const after = Number(await page.locator('#balance').getAttribute('data-balance-cents'))
  expect(before - after, 'the balance changes by exactly the line total').toBe(chili.total_cents)
  const ledger = await api(request, 'GET', '/api/family/ledger', undefined, bearer(s.token))
  expect(ledger.body.balance_cents).toBe(after)
})

test('balance phrases: owing, all paid up and a credit, with the payment instructions only while owing', async ({ page, context, request }) => {
  const s = await useFamilySession(context, request, CODE.liamAva)
  const office = await staffToken(request, PIN.admin)
  await placeOrderViaApi(request, s.token, [{ child_id: 'ch-ava', date: '2026-09-17', item_id: 'mac', qty: 1 }])
  await page.goto('/family/')
  await expect(page.locator('#balance-text')).toHaveText('You owe $4.00')
  await expect(page.locator('#payment-instructions')).toBeVisible()

  await paymentViaApi(request, office, { family_id: 'fam-1', amount_cents: 400, method: 'cash' })
  await page.reload()
  await expect(page.locator('#balance-text')).toHaveText('All paid up')
  await expect(page.locator('#payment-instructions')).toBeHidden()

  await paymentViaApi(request, office, { family_id: 'fam-1', amount_cents: 300, method: 'etransfer' })
  await page.reload()
  await expect(page.locator('#balance-text')).toHaveText('You have a $3.00 credit')
  await expect(page.locator('#balance')).toHaveAttribute('data-balance-cents', '-300')
})

test('a storm closure added through the API shows as a credit in history', async ({ page, context, request }) => {
  const s = await useFamilySession(context, request, CODE.liamAva)
  await placeOrderViaApi(request, s.token, [
    { child_id: 'ch-ava', date: '2026-09-17', item_id: 'chili', qty: 1 },
    { child_id: 'ch-liam', date: '2026-09-17', item_id: 'apple', qty: 1 },
  ])
  await noSchoolViaApi(request, await staffToken(request, PIN.admin), { date: '2026-09-17', kind: 'closure', note: 'Storm (SAMPLE)' })
  await page.goto('/family/')
  await expect(page.locator('#balance-text')).toHaveText('All paid up')
  await tap(page, page.locator('#history-link'), 'History')
  await expect(page).toHaveURL(/\/family\/history\/$/)
  const credit = page.locator('.entry[data-kind="closure"]')
  await expect(credit).toHaveCount(1)
  await expect(credit.locator('.label')).toContainText('Credit: School closed Thu Sep 17')
  await expect(credit.locator('.amount')).toHaveText('-$6.00')
  await expect(page.locator('.entry[data-kind="order"] .amount')).toHaveText('$6.00')
  await expect(page.locator('#balance-text')).toHaveText('All paid up')
  await expect(page.locator('.line[data-status="closed"]')).toHaveCount(2)
  await expect(page.locator('.line[data-status="closed"]').first()).toContainText('No school, credited')
})

test('an allergy ticked after ordering: home shows the red warning and "I understand, keep it" confirms it; the kitchen agrees', async ({ page, context, request }) => {
  const s = await useFamilySession(context, request, CODE.liamAva)
  const placed = await placeOrderViaApi(request, s.token, [{ child_id: 'ch-ava', date: '2026-09-17', item_id: 'mac', qty: 1 }])
  const lineId = placed.order.lines[0].id
  await page.goto('/family/')
  const line = page.locator(`.line[data-line="${lineId}"]`)
  await expect(line).toContainText('Ava, Macaroni and cheese ×1')
  await expect(line.locator('.allergen-warning'), 'no warning before the allergy is ticked').toHaveCount(0)

  await page.goto('/family/children/')
  await tap(page, page.locator('.child-row[data-child="ch-ava"] .edit-child'), 'Edit Ava')
  await tap(page, page.locator('input[name="allergy"][value="milk"]'), 'tick Milk')
  await tap(page, page.locator('#save-child'), 'Save')
  await expect(page.locator('#child-saved')).toHaveText('Saved Ava.')

  await tap(page, page.getByRole('link', { name: 'Back to your lunches' }), 'Back to your lunches')
  await expect(page).toHaveURL(/\/family\/$/)
  await expect(line.locator('.allergen-warning')).toHaveText('Ava is allergic to Milk. Macaroni and cheese contains Milk.')
  await expect(line.locator('.late-note')).toHaveText('You ticked this allergy after ordering.')
  await expect(line.locator('button.ack-line')).toHaveText('I understand, keep it')
  await expect(line.locator('button.cancel-line')).toBeVisible()
  const kitchen = await staffToken(request, PIN.kitchen)
  const kitchenLine = async () => (await kitchenDayViaApi(request, kitchen, '2026-09-17')).children.flatMap((c) => c.lines).find((l) => l.line_id === lineId)
  expect((await kitchenLine()).acknowledged, 'the kitchen shows it not confirmed').toBe(false)

  await tap(page, line.locator('button.ack-line'), 'I understand, keep it')
  await expect(line.locator('.allergen-warning')).toHaveCount(0)
  await expect(line.locator('button.ack-line')).toHaveCount(0)
  await expect(line).toBeVisible()
  expect((await kitchenLine()).acknowledged, 'the kitchen agrees').toBe(true)
  const lines = await familyOrdersViaApi(request, s.token)
  expect(lines[0]).toMatchObject({ conflicts: ['milk'], acknowledged: true, ack_allergens: ['milk'] })
  await page.reload()
  await expect(line.locator('.allergen-warning'), 'still confirmed after a reload').toHaveCount(0)
})
