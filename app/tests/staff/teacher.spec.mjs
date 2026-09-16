// Teacher's class list on Thu Sep 17 at noon: Given out / Absent counts come from the API answer and survive a reload.
import { expect, test } from '@playwright/test'
import {
  api,
  assertNoThirdParty,
  bearer,
  expectNoHorizontalScroll,
  expectTapTarget,
  fresh,
  nl,
  PIN,
  setNow,
  shot,
  staffToken,
  tap,
  useStaffSession,
} from '../helpers.mjs'
import { FRI, orderThursday, THU } from './setup.mjs'

const THU_NOON = nl(THU, '12:00')
const FRI_NOON = nl(FRI, '12:00')

test.beforeEach(async ({ context, request }) => {
  await fresh(context, request, { now: THU_NOON })
  await orderThursday(request) // placed at the Tue anchor, before Thursday's cut-off
})
test.afterEach(async ({ context }) => {
  assertNoThirdParty(context)
})

async function openRoom4(page, context, request, now = THU_NOON) {
  await useStaffSession(context, request, PIN.oldford, { now })
  await page.goto('/teacher/')
  await expect(page.locator('#teacher-date-label')).toContainText('Room 4')
}

test('Given out and Absent update the counts from the answer and survive a reload', async ({ page, context, request }) => {
  await openRoom4(page, context, request)
  await expect(page.locator('#class-pick')).toHaveValue('room-2')
  await expect(page.locator('.child-row')).toHaveCount(2) // Room 4: Jack and Liam
  const token = await staffToken(request, PIN.oldford, { now: THU_NOON })
  const expectCounts = async (c, why) => {
    await expect(page.locator('#count-waiting'), `count-waiting ${why}`).toHaveText(String(c.waiting))
    await expect(page.locator('#count-delivered'), `count-delivered ${why}`).toHaveText(String(c.delivered))
    await expect(page.locator('#count-absent'), `count-absent ${why}`).toHaveText(String(c.absent))
    const r = await api(request, 'GET', `/api/teacher/day?class_id=room-2&date=${THU}`, undefined, bearer(token), { now: THU_NOON })
    expect(r.status).toBe(200)
    const { waiting, delivered, absent } = r.body.counts
    expect({ waiting, delivered, absent }, `API counts ${why}`).toEqual(c)
  }
  const mark = (child, state) => page.locator(`.child-row[data-child="${child}"] button.mark[data-state="${state}"]`)

  await expectCounts({ waiting: 2, delivered: 0, absent: 0 }, 'at the start')
  await tap(page, mark('ch-liam', 'delivered'), 'Liam given out')
  await expect(mark('ch-liam', 'delivered')).toHaveAttribute('aria-pressed', 'true')
  await expectCounts({ waiting: 1, delivered: 1, absent: 0 }, 'after Liam given out')
  await tap(page, mark('ch-jack', 'absent'), 'Jack absent')
  await expect(mark('ch-jack', 'absent')).toHaveAttribute('aria-pressed', 'true')
  await expectCounts({ waiting: 0, delivered: 1, absent: 1 }, 'after Jack absent')

  await page.reload()
  await expect(page.locator('.child-row')).toHaveCount(2)
  await expect(mark('ch-liam', 'delivered')).toHaveAttribute('aria-pressed', 'true')
  await expect(mark('ch-jack', 'absent')).toHaveAttribute('aria-pressed', 'true')
  await expectCounts({ waiting: 0, delivered: 1, absent: 1 }, 'after a reload')

  await tap(page, mark('ch-liam', 'delivered'), 'Liam given out again (clears it)')
  await expect(mark('ch-liam', 'delivered')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.child-row[data-child="ch-liam"]')).toHaveAttribute('data-state', 'waiting')
  await expectCounts({ waiting: 1, delivered: 0, absent: 1 }, 'after clearing Liam')
})

test('another day shows the list without buttons', async ({ page, context, request }) => {
  await setNow(context, FRI_NOON)
  await openRoom4(page, context, request, FRI_NOON)
  await expect(page.locator('#class-list')).toContainText('Nobody in Room 4 has a lunch ordered for Fri Sep 18.')
  await expectTapTarget(page, page.locator('#teacher-date'), 44, 'day picker')
  await page.locator('#teacher-date').fill(THU)
  await expect(page.locator('.child-row')).toHaveCount(2)
  await expect(page.locator('button.mark')).toHaveCount(0)
  await expect(page.locator('#teacher-note')).toHaveText('You can mark lunches given out on the day. This list is for Thu Sep 17.')
})

test('teacher marks are 56 px, not covered, no sideways scroll', async ({ page, context, request }, testInfo) => {
  await openRoom4(page, context, request)
  await expect(page.locator('button.mark')).toHaveCount(4)
  for (const b of await page.locator('button.mark').all()) await expectTapTarget(page, b, 56, 'teacher mark button')
  await expectTapTarget(page, page.locator('#class-pick'), 44, 'class picker')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expectNoHorizontalScroll(page)
  await shot(page, testInfo, 'staff', 'teacher')
})
