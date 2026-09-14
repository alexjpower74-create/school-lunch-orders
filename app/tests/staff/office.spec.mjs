// Office: payments to the cent, undo, family codes shown once, CSV downloaded by a real click.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  api, assertNoThirdParty, CODE, expectNoHorizontalScroll, expectTapTarget, fresh, isCoarse, paymentViaApi, PIN, shot, staffToken, tap, type,
  useStaffSession,
} from '../helpers.mjs'
import { orderThursday, staffGet } from './setup.mjs'

test.beforeEach(async ({ context, request }) => {
  await fresh(context, request)
  await orderThursday(request)
})
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

async function openOffice(page, context, request) {
  await useStaffSession(context, request, PIN.admin)
  await page.goto('/office/')
  await expect(page.locator('.family-row')).toHaveCount(4)
}
async function openFamily(page, id) {
  await tap(page, page.locator(`.family-row[data-family="${id}"]`), `family ${id}`)
  await expect(page.locator('#family-panel')).toBeVisible()
}

test('record a payment by typing, then undo it', async ({ page, context, request }) => {
  await openOffice(page, context, request)
  await openFamily(page, 'fam-1')
  await expect(page.locator('#family-balance')).toHaveAttribute('data-balance-cents', '1050')
  await expect(page.locator('#payment-amount')).toHaveValue('10.50')

  await type(page, page.locator('#payment-amount'), '4.25', { clear: true })
  await tap(page, page.locator('#record-payment'), 'record payment')
  await expect(page.locator('#family-balance'), '#family-balance after the payment').toHaveAttribute('data-balance-cents', '625')
  await expect(page.locator('#family-balance')).toHaveText('Owes $6.25')
  await expect(page.locator('.family-row[data-family="fam-1"] .balance'), 'row balance after the payment').toHaveAttribute('data-balance-cents', '625')
  expect((await staffGet(request, '/api/office/families/fam-1')).balance_cents, 'API balance after the payment').toBe(625)

  const payment = page.locator('#ledger .entry[data-kind="payment"]').first()
  await expect(payment).toContainText('-$4.25')
  await tap(page, payment.locator('button.void-entry'), 'undo')
  await tap(page, page.locator('#ledger .entry[data-kind="payment"]').first().locator('button.confirm-void'), 'yes, undo it')
  await expect(page.locator('#family-balance'), '#family-balance after undo').toHaveAttribute('data-balance-cents', '1050')
  await expect(page.locator('#ledger .entry[data-kind="payment"]').first()).toHaveClass(/voided/)
  await expect(page.locator('#ledger .entry[data-kind="payment"]').first()).toContainText('Undone')
  await expect(page.locator('.family-row[data-family="fam-1"] .balance')).toHaveAttribute('data-balance-cents', '1050')
  expect((await staffGet(request, '/api/office/families/fam-1')).balance_cents, 'API balance after undo').toBe(1050)
})

test('an adjustment either way changes the balance to the cent', async ({ page, context, request }) => {
  await openOffice(page, context, request)
  await openFamily(page, 'fam-1')
  await expect(page.locator('#family-balance')).toHaveAttribute('data-balance-cents', '1050')
  const openAdjust = async () => {
    if (!(await page.locator('#family-panel details').evaluate((d) => d.open))) {
      await tap(page, page.locator('#family-panel details summary'), 'add an adjustment')
    }
    await expect(page.locator('#adjust-amount')).toBeVisible()
  }
  const apiBalance = async () => (await staffGet(request, '/api/office/families/fam-1')).balance_cents

  await openAdjust()
  await type(page, page.locator('#adjust-amount'), '2.50')
  await type(page, page.locator('#adjust-note'), 'Extra milk for the week (SAMPLE)')
  await tap(page, page.locator('#record-adjustment'), 'add adjustment +2.50')
  await expect(page.locator('#family-balance'), '#family-balance after +2.50').toHaveAttribute('data-balance-cents', '1300')
  await expect(page.locator('#family-balance')).toHaveText('Owes $13.00')
  expect(await apiBalance(), 'API balance after +2.50').toBe(1300)

  await openAdjust()
  await type(page, page.locator('#adjust-amount'), '-4.00')
  await type(page, page.locator('#adjust-note'), 'Absent Thursday, credited (SAMPLE)')
  await tap(page, page.locator('#record-adjustment'), 'add adjustment -4.00')
  await expect(page.locator('#family-balance'), '#family-balance after -4.00').toHaveAttribute('data-balance-cents', '900')
  await expect(page.locator('.family-row[data-family="fam-1"] .balance')).toHaveAttribute('data-balance-cents', '900')
  expect(await apiBalance(), 'API balance after -4.00').toBe(900)
  await expect(page.locator('#ledger .entry[data-kind="adjustment"]').first()).toContainText('-$4.00')

  await page.reload()
  await expect(page.locator('.family-row')).toHaveCount(4)
  await openFamily(page, 'fam-1')
  await expect(page.locator('#family-balance')).toHaveAttribute('data-balance-cents', '900')
  await expect(page.locator('#ledger .entry[data-kind="adjustment"]')).toHaveCount(2)
})

test('a double tap on Add adjustment records one adjustment', async ({ page, context, request }) => {
  await openOffice(page, context, request)
  await openFamily(page, 'fam-1')
  await expect(page.locator('#family-balance')).toHaveAttribute('data-balance-cents', '1050')
  await tap(page, page.locator('#family-panel details summary'), 'add an adjustment')
  await type(page, page.locator('#adjust-amount'), '1.00')
  await type(page, page.locator('#adjust-note'), 'Double tap check (SAMPLE)')
  const button = page.locator('#record-adjustment')
  await expectTapTarget(page, button, 44, 'add adjustment')
  const box = await button.boundingBox()
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  // Two real taps back to back, without waiting for the answer in between.
  if (await isCoarse(page)) {
    await page.touchscreen.tap(x, y)
    await page.touchscreen.tap(x, y)
  } else {
    await page.mouse.click(x, y)
    await page.mouse.click(x, y)
  }
  await expect(page.locator('#family-balance')).toHaveAttribute('data-balance-cents', /^(1150|1250)$/)
  await page.waitForLoadState('networkidle') // let a second request, if one was sent, land before counting
  const stored = (await staffGet(request, '/api/office/families/fam-1')).entries.filter((e) => e.kind === 'adjustment')
  expect(stored.length, 'adjustments stored after a double tap').toBe(1)
  await expect(page.locator('#ledger .entry[data-kind="adjustment"]'), 'adjustments in the ledger').toHaveCount(1)
  await expect(page.locator('#family-balance')).toHaveAttribute('data-balance-cents', '1150')
})

test('add a family shows the code once and it signs in', async ({ page, context, request }) => {
  await openOffice(page, context, request)
  await type(page, page.locator('#add-family-label'), 'Hillview family (SAMPLE)')
  await tap(page, page.locator('#add-family'), 'add family')
  await expect(page.locator('#code-value')).toHaveText(/^[A-Z2-9]{4}-?[A-Z2-9]{4}$/)
  const code = (await page.locator('#code-value').textContent()).trim()
  await expect(page.locator('.family-row')).toHaveCount(5)
  const r = await api(request, 'POST', '/api/family/signin', { code })
  expect(r.status, `the new code signs in: ${JSON.stringify(r.body)}`).toBe(200)
  expect(r.body.family.label).toBe('Hillview family (SAMPLE)')
  await page.reload()
  await expect(page.locator('.family-row')).toHaveCount(5)
  await expect(page.locator('#code-value')).toHaveCount(0)
  expect(await page.content(), 'the code is not shown again').not.toContain(code)
})

test('new code stops the old one', async ({ page, context, request }) => {
  expect((await api(request, 'POST', '/api/family/signin', { code: CODE.owen })).status, 'old code works before').toBe(200)
  await openOffice(page, context, request)
  await openFamily(page, 'fam-4')
  await tap(page, page.locator('#new-code'), 'new code')
  await tap(page, page.locator('#confirm-new-code'), 'yes, make a new code')
  await expect(page.locator('#code-value')).toHaveText(/^[A-Z2-9]{4}-?[A-Z2-9]{4}$/)
  const code = (await page.locator('#code-value').textContent()).trim()
  expect((await api(request, 'POST', '/api/family/signin', { code: CODE.owen })).status, 'old code refused').toBe(401)
  expect((await api(request, 'POST', '/api/family/signin', { code })).status, 'new code signs in').toBe(200)
})

test('ledger CSV downloads by a real click', async ({ page, context, request }) => {
  await paymentViaApi(request, await staffToken(request, PIN.admin), { family_id: 'fam-1', amount_cents: 500 })
  await openOffice(page, context, request)
  const [ledger] = await Promise.all([page.waitForEvent('download'), tap(page, page.locator('#ledger-csv'), 'ledger CSV')])
  expect(ledger.suggestedFilename()).toMatch(/^lunch-ledger-.+\.csv$/)
  const rows = readFileSync(await ledger.path(), 'utf8').split('\r\n')
  expect(rows[0], 'ledger CSV header').toBe('Date,Time,Family,Kind,Description,Amount,Method,Note,Voided')
  const fam1 = rows.filter((r) => r.includes('Liam and Ava (SAMPLE)'))
  expect(fam1.some((r) => r.includes(',10.50,')), `fam-1 order 10.50 in ${JSON.stringify(fam1)}`).toBe(true)
  expect(fam1.some((r) => r.includes(',-5.00,')), `fam-1 payment -5.00 in ${JSON.stringify(fam1)}`).toBe(true)

  const [balances] = await Promise.all([page.waitForEvent('download'), tap(page, page.locator('#balances-csv'), 'balances CSV')])
  const brows = readFileSync(await balances.path(), 'utf8').split('\r\n')
  expect(brows[0], 'balances CSV header').toBe('Family,Children,Balance')
  expect(brows.find((r) => r.includes('Liam and Ava (SAMPLE)')), 'fam-1 balance 5.50').toMatch(/,5\.50$/)
})

test('office tap targets, no sideways scroll, screenshots', async ({ page, context, request }, testInfo) => {
  await openOffice(page, context, request)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expectNoHorizontalScroll(page)
  await shot(page, testInfo, 'staff', 'office')
  await openFamily(page, 'fam-3')
  for (const sel of ['#payment-amount', '#payment-method', '#record-payment', '#new-code', '#close-family', '#ledger-csv', '#add-family', '.family-row[data-family="fam-1"]']) {
    await expectTapTarget(page, page.locator(sel), 44, sel)
  }
  await expectNoHorizontalScroll(page)
  await page.locator('#family-panel').scrollIntoViewIfNeeded()
  await shot(page, testInfo, 'staff', 'office-family')
})
