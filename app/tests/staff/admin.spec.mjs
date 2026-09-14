// Settings: a storm closure through the no-school form (preview numbers, credits to the cent, kitchen empty), the menu grid.
import { expect, test } from '@playwright/test'
import {
  api, assertNoThirdParty, bearer, expectNoHorizontalScroll, expectTapTarget, fresh, PIN, shot, staffToken, tap, type, useStaffSession,
} from '../helpers.mjs'
import { balancesViaApi, EXPECT_CREDIT, EXPECT_CREDIT_TOTAL, EXPECT_ITEM_COUNT, EXPECT_LINES, orderThursday, staffGet, THU } from './setup.mjs'

const desktopOnly = (testInfo) =>
  test.skip(testInfo.project.name.endsWith('-390'), 'The menu grid and settings screenshots are a desktop job (PLAN lets settings skip 390).')

test.beforeEach(async ({ context, request }) => {
  await fresh(context, request)
  await orderThursday(request)
})
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

async function openSettings(page, context, request, tab) {
  await useStaffSession(context, request, PIN.admin)
  await page.goto('/admin/')
  await expect(page.locator('#panel-school')).toBeVisible()
  await tap(page, page.locator(`button.tab[data-tab="${tab}"]`), `${tab} tab`)
  await expect(page.locator(`#panel-${tab}`)).toBeVisible()
}

test('storm closure: confirm numbers equal the preview, credits to the cent', async ({ page, context, request }) => {
  const before = await balancesViaApi(request)
  await openSettings(page, context, request, 'days')
  await expectTapTarget(page, page.locator('#no-school-date'), 44, 'no-school date')
  await page.locator('#no-school-date').fill(THU)
  await expect(page.locator('#no-school-kind')).toHaveValue('closure')
  await type(page, page.locator('#no-school-note'), 'Storm closure (SAMPLE)')
  await tap(page, page.locator('#add-no-school'), 'add no-school day')

  const preview = await staffGet(request, `/api/admin/no-school/preview?date=${THU}`)
  expect(preview, 'the API preview = the hand-computed numbers').toMatchObject({ lines: EXPECT_LINES, item_count: EXPECT_ITEM_COUNT, families: 4, credit_cents: EXPECT_CREDIT_TOTAL })
  await expect(page.locator('#no-school-confirm')).toBeVisible()
  await expect(page.locator('#confirm-lunches'), 'confirm-lunches = preview item_count').toHaveText(`${preview.item_count} lunches`)
  await expect(page.locator('#confirm-families'), 'confirm-families = preview families').toHaveText(`${preview.families} families`)
  await expect(page.locator('#confirm-credit'), 'confirm-credit = preview credit').toHaveText('$34.25')
  await expect(page.locator('#no-school-preview')).toHaveText('This cancels 13 lunches for 4 families and credits $34.25 to their balances.')

  await tap(page, page.locator('#confirm-no-school'), 'yes, add the no-school day')
  await expect(page.locator('#no-school-result')).toHaveText('Thu Sep 17 is now a no-school day. Cancelled 13 lunches for 4 families. Credited $34.25.')
  await expect(page.locator(`.no-school-row[data-date="${THU}"]`)).toContainText('School closed')

  const after = await balancesViaApi(request)
  for (const [fam, credit] of Object.entries(EXPECT_CREDIT)) expect(before[fam] - after[fam], `${fam} credited to the cent`).toBe(credit)

  await page.goto(`/kitchen/?date=${THU}`)
  await expect(page.locator('#no-school')).toBeVisible()
  await expect(page.locator('#no-school')).toContainText('No school: School closed.')
  await expect(page.locator('#stat-items')).toHaveText('0')
  await expect(page.locator('#item-totals tr[data-item]')).toHaveCount(0)
  await expect(page.locator('#children tr.child-row')).toHaveCount(0)

  await page.goto('/office/')
  await expect(page.locator('.family-row')).toHaveCount(4)
  for (const [fam, cents] of Object.entries(after)) {
    await expect(page.locator(`.family-row[data-family="${fam}"] .balance`), `${fam} office balance after the closure`).toHaveAttribute('data-balance-cents', String(cents))
  }
})

test('menu grid: saves a free day, refuses an ordered item and puts the tick back', async ({ page, context, request }, testInfo) => {
  desktopOnly(testInfo)
  await openSettings(page, context, request, 'menu')
  await expect(page.locator('#menu-week-label')).toHaveText('Sep 14 to 18')
  const menuDay = async (date) => (await staffGet(request, `/api/admin/menu?week=${date}`)).days.find((d) => d.date === date)

  const friCookie = page.locator('input.menu-cell[data-date="2026-09-18"][data-item="cookie"]')
  await expect(friCookie).toBeChecked()
  await tap(page, friCookie, 'untick cookie on Fri Sep 18')
  await expect(page.locator('#menu-saved')).toHaveText('Saved the menu for Fri Sep 18.')
  await expect(friCookie).not.toBeChecked()
  expect((await menuDay('2026-09-18')).item_ids, 'Fri Sep 18 saved without the cookie').not.toContain('cookie')

  const thuMac = page.locator(`input.menu-cell[data-date="${THU}"][data-item="mac"]`)
  await expect(page.locator(`.ordered[data-date="${THU}"][data-item="mac"]`)).toHaveText('3 ordered')
  await tap(page, thuMac, 'untick mac on Thu Sep 17 (ordered)')
  await expect(page.locator('#menu-error')).toContainText('already ordered')
  await expect(thuMac, 'the tick comes back').toBeChecked()
  expect((await menuDay(THU)).item_ids, 'Thu Sep 17 still has mac').toContain('mac')
})

test('menu grid: fill from usual days on an empty week', async ({ page, context, request }, testInfo) => {
  desktopOnly(testInfo)
  await openSettings(page, context, request, 'menu')
  const label = page.locator('#menu-week-label')
  await expect(label).toHaveText('Sep 14 to 18')
  // The seed's menu runs through Dec 18; the week of Dec 21 has school days and no items.
  for (let i = 0; i < 20 && (await label.textContent()) !== 'Dec 21 to 25'; i++) {
    const was = await label.textContent()
    await tap(page, page.locator('#menu-next'), 'next week')
    await expect(label).not.toHaveText(was)
  }
  await expect(label).toHaveText('Dec 21 to 25')
  const cells = page.locator('input.menu-cell')
  await expect(cells).toHaveCount(50)
  await expect(page.locator('input.menu-cell:checked'), 'an empty week before filling').toHaveCount(0)

  await tap(page, page.locator('#fill-week'), 'fill from usual days')
  await expect(page.locator('#menu-saved')).toContainText('Filled')
  const { items } = await staffGet(request, '/api/admin/settings')
  const week = await staffGet(request, '/api/admin/menu?week=2026-12-21')
  for (const day of week.days) {
    const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay()
    const usual = items.filter((it) => it.active && it.days.includes(weekday)).map((it) => it.id).sort()
    expect([...day.item_ids].sort(), `${day.date} filled from usual days (API)`).toEqual(usual)
    const ticked = await page.locator(`input.menu-cell[data-date="${day.date}"]:checked`).evaluateAll((els) => els.map((e) => e.dataset.item).sort())
    expect(ticked, `${day.date} ticks on the page`).toEqual(usual)
  }
})

test('settings tabs: tap targets and screenshots', async ({ page, context, request }, testInfo) => {
  desktopOnly(testInfo)
  await openSettings(page, context, request, 'school')
  await expect(page.locator('#school-name')).toHaveValue('SAMPLE Harbour Pond Elementary (demo)')
  for (const t of ['school', 'menu', 'days', 'items', 'classes', 'staff']) {
    await expectTapTarget(page, page.locator(`button.tab[data-tab="${t}"]`), 44, `${t} tab`)
  }
  await shot(page, testInfo, 'staff', 'admin-school')
  for (const t of ['menu', 'days', 'items', 'classes', 'staff']) {
    await tap(page, page.locator(`button.tab[data-tab="${t}"]`), `${t} tab`)
    await expect(page.locator(`#panel-${t}`)).toBeVisible()
    if (t === 'menu') {
      await expect(page.locator('input.menu-cell').first()).toBeVisible()
      await expectTapTarget(page, page.locator('input.menu-cell').first(), 44, 'menu cell')
    }
    await expectNoHorizontalScroll(page)
    await shot(page, testInfo, 'staff', `admin-${t}`)
  }
})
