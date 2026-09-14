// Settings forms, saved through the page: School, Items (new and edit), Classes, Staff PINs. Each saves, reloads, and checks
// the page and GET /api/admin/settings. Native <select> and <input type="date"> use PLAN's exception (hit-test, then set).
import { expect, test } from '@playwright/test'
import { api, assertNoThirdParty, expectTapTarget, fresh, NOW, PIN, SCHOOL, tap, type, useStaffSession } from '../helpers.mjs'
import { staffGet } from './setup.mjs'

test.beforeEach(async ({ context, request }) => { await fresh(context, request) })
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

async function openTab(page, context, request, tab) {
  await useStaffSession(context, request, PIN.admin)
  await page.goto(`/admin/#${tab}`)
  await expect(page.locator(`#panel-${tab}`)).toBeVisible()
}
const settings = (request) => staffGet(request, '/api/admin/settings')
async function choose(page, sel, value) {
  await expectTapTarget(page, page.locator(sel), 44, sel)
  await page.locator(sel).selectOption(value)
}
async function setBox(page, locator, on, label) {
  if ((await locator.isChecked()) !== on) await tap(page, locator, label)
  await expect(locator).toBeChecked({ checked: on })
}
const checkedValues = (page, name) => page.locator(`input[name="${name}"]:checked`).evaluateAll((els) => els.map((e) => e.value).sort())

test('school settings save and come back after a reload', async ({ page, context, request }) => {
  await openTab(page, context, request, 'school')
  await expect(page.locator('#school-name')).toHaveValue(SCHOOL)
  const name = 'SAMPLE Harbour Pond Elementary (demo, renamed)'
  const pay = "Send cash in a sealed envelope marked with your child's name and room. (SAMPLE)"

  // A refusal first: the year ending before it starts is named on the field.
  await expectTapTarget(page, page.locator('#year-end'), 44, 'year end')
  await page.locator('#year-end').fill('2026-09-01')
  await tap(page, page.locator('#save-school'), 'save school')
  await expect(page.locator('#school-error')).toBeVisible()
  await expect(page.locator('#year-end')).toHaveAttribute('aria-invalid', 'true')

  await type(page, page.locator('#school-name'), name, { clear: true })
  await type(page, page.locator('#payment-instructions-input'), pay, { clear: true })
  await type(page, page.locator('#cutoff-days'), '2', { clear: true })
  await type(page, page.locator('#cutoff-time'), '08:30', { clear: true })
  await page.locator('#year-end').fill('2027-06-18')
  await tap(page, page.locator('#save-school'), 'save school')
  await expect(page.locator('#school-saved'), 'school-saved').toHaveText('Saved.')
  await expect(page.locator('#school-error')).toBeHidden()
  await expect(page.locator('#year-end')).not.toHaveAttribute('aria-invalid', 'true')

  const { school } = await settings(request)
  expect(school, 'the API school after saving').toMatchObject({
    school_name: name, payment_instructions: pay, cutoff_days_before: 2, cutoff_time: '08:30', year_start: '2026-09-08', year_end: '2027-06-18', sample: true,
  })
  const info = await (await request.get('/api/info', { headers: { 'X-Test-Now': NOW } })).json()
  expect(info.cutoff_rule_label).toContain('8:30 AM')

  await page.reload()
  await expect(page.locator('#school-name')).toHaveValue(name)
  await expect(page.locator('#payment-instructions-input')).toHaveValue(pay)
  await expect(page.locator('#cutoff-days')).toHaveValue('2')
  await expect(page.locator('#cutoff-time')).toHaveValue('08:30')
  await expect(page.locator('#year-end')).toHaveValue('2027-06-18')
  await expect(page.locator('#cutoff-rule')).toHaveText(`Parents see: "${info.cutoff_rule_label}"`)
  await expect(page.locator('[data-sticky-header] .brand-name')).toHaveText(name)
})

test('a new item saves with price in dollars, allergens, days and max', async ({ page, context, request }) => {
  await openTab(page, context, request, 'items')
  await tap(page, page.locator('#new-item'), 'new item')
  await expect(page.locator('#item-form-title')).toHaveText('New item')
  await type(page, page.locator('#item-name'), 'Pea soup (SAMPLE)')
  await type(page, page.locator('#item-price'), '3.75')
  await type(page, page.locator('#item-max'), '2')
  await type(page, page.locator('#item-ingredients'), 'Split peas, carrots, onion, wheat roll (SAMPLE)')
  for (const k of ['wheat_triticale', 'gluten']) await setBox(page, page.locator(`input[name="item-allergen"][value="${k}"]`), true, k)
  for (const d of ['1', '3']) await setBox(page, page.locator(`input[name="item-day"][value="${d}"]`), true, `day ${d}`)
  await setBox(page, page.locator('#item-veg'), true, 'vegetarian')
  await tap(page, page.locator('#save-item'), 'save item')
  await expect(page.locator('#item-saved'), 'item-saved').toHaveText('Saved Pea soup (SAMPLE).')

  const item = (await settings(request)).items.find((i) => i.name === 'Pea soup (SAMPLE)')
  expect(item, 'the new item is in the API').toBeTruthy()
  expect({ ...item, allergens: [...item.allergens].sort() }, 'the API item after saving').toMatchObject({
    price_cents: 375, allergens: ['gluten', 'wheat_triticale'], days: [1, 3], max_per_child: 2, vegetarian: true, active: true,
    ingredients: 'Split peas, carrots, onion, wheat roll (SAMPLE)',
  })

  await page.reload()
  const row = page.locator(`.item-row[data-item="${item.id}"]`)
  await expect(row).toContainText('Pea soup (SAMPLE) · $3.75')
  await tap(page, row.locator('button.edit-item'), 'edit pea soup')
  await expect(page.locator('#item-name')).toHaveValue('Pea soup (SAMPLE)')
  await expect(page.locator('#item-price')).toHaveValue('3.75')
  await expect(page.locator('#item-max')).toHaveValue('2')
  expect(await checkedValues(page, 'item-allergen')).toEqual(['gluten', 'wheat_triticale'])
  expect(await checkedValues(page, 'item-day')).toEqual(['1', '3'])
  await expect(page.locator('#item-veg')).toBeChecked()
  await expect(page.locator('#item-active')).toBeChecked()
})

test('editing an item changes price, allergens, days and max, and the API agrees', async ({ page, context, request }) => {
  await openTab(page, context, request, 'items')
  await tap(page, page.locator('.item-row[data-item="mac"] button.edit-item'), 'edit mac')
  await expect(page.locator('#item-price')).toHaveValue('4.00')
  await expect(page.locator('#item-max')).toHaveValue('1')
  await type(page, page.locator('#item-price'), '4.25', { clear: true })
  await type(page, page.locator('#item-max'), '', { clear: true })
  await setBox(page, page.locator('input[name="item-allergen"][value="mustard"]'), true, 'mustard')
  await setBox(page, page.locator('input[name="item-day"][value="2"]'), false, 'Tuesday off')
  await tap(page, page.locator('#save-item'), 'save item')
  await expect(page.locator('#item-saved'), 'item-saved').toHaveText('Saved Macaroni and cheese.')

  const mac = (await settings(request)).items.find((i) => i.id === 'mac')
  expect({ ...mac, allergens: [...mac.allergens].sort() }, 'the API item after editing').toMatchObject({
    price_cents: 425, allergens: ['gluten', 'milk', 'mustard', 'wheat_triticale'], days: [4], max_per_child: null, active: true,
  })

  await page.reload()
  await expect(page.locator('.item-row[data-item="mac"]')).toContainText('$4.25')
  await tap(page, page.locator('.item-row[data-item="mac"] button.edit-item'), 'edit mac again')
  await expect(page.locator('#item-price')).toHaveValue('4.25')
  await expect(page.locator('#item-max')).toHaveValue('')
  expect(await checkedValues(page, 'item-allergen')).toEqual(['gluten', 'milk', 'mustard', 'wheat_triticale'])
  expect(await checkedValues(page, 'item-day')).toEqual(['4'])
})

test('a new class saves, then an edit saves, each after a reload', async ({ page, context, request }) => {
  await openTab(page, context, request, 'classes')
  await tap(page, page.locator('#new-class'), 'new class')
  await type(page, page.locator('#class-name'), 'Room 10', { clear: true })
  await type(page, page.locator('#class-grade'), 'Grade 6', { clear: true })
  await type(page, page.locator('#class-sort'), '7', { clear: true })
  await tap(page, page.locator('#save-class'), 'save class')
  await expect(page.locator('#class-saved')).toHaveText('Saved Room 10.')

  const made = (await settings(request)).classes.find((c) => c.name === 'Room 10')
  expect(made, 'the API class after saving').toMatchObject({ grade: 'Grade 6', sort: 7 })
  await page.reload()
  const row = page.locator(`.class-row[data-class="${made.id}"]`)
  await expect(row).toContainText('Room 10 · Grade 6')

  await tap(page, row.locator('button.edit-class'), 'edit Room 10')
  await expect(page.locator('#class-name')).toHaveValue('Room 10')
  await type(page, page.locator('#class-grade'), 'Grades 5 and 6', { clear: true })
  await type(page, page.locator('#class-sort'), '8', { clear: true })
  await tap(page, page.locator('#save-class'), 'save class')
  await expect(page.locator('#class-saved')).toHaveText('Saved Room 10.')
  expect((await settings(request)).classes.find((c) => c.id === made.id), 'the API class after editing').toMatchObject({ name: 'Room 10', grade: 'Grades 5 and 6', sort: 8 })
  await page.reload()
  await expect(page.locator(`.class-row[data-class="${made.id}"]`)).toContainText('Room 10 · Grades 5 and 6')
})

test('a new staff PIN saves and signs in; a taken PIN is refused on #staff-pin', async ({ page, context, request }) => {
  await openTab(page, context, request, 'staff')
  await tap(page, page.locator('#new-staff'), 'new staff member')
  await type(page, page.locator('#staff-name'), 'Ms. Hynes (SAMPLE)', { clear: true })
  await choose(page, '#staff-role', 'teacher')
  await choose(page, '#staff-class', 'room-3')
  await type(page, page.locator('#staff-pin'), PIN.oldford) // already Ms. Oldford's
  await tap(page, page.locator('#save-staff'), 'save staff')
  await expect(page.locator('#staff-error')).toContainText('PIN')
  await expect(page.locator('#staff-pin'), 'a taken PIN is marked on #staff-pin').toHaveAttribute('aria-invalid', 'true')
  expect((await settings(request)).staff.length, 'nothing saved').toBe(4)

  await type(page, page.locator('#staff-pin'), '5566', { clear: true })
  await tap(page, page.locator('#save-staff'), 'save staff')
  await expect(page.locator('#staff-saved')).toHaveText('Saved Ms. Hynes (SAMPLE).')
  await expect(page.locator('#staff-pin')).not.toHaveAttribute('aria-invalid', 'true')
  const hynes = (await settings(request)).staff.find((s) => s.name === 'Ms. Hynes (SAMPLE)')
  expect(hynes, 'the API staff member after saving').toMatchObject({ role: 'teacher', class_id: 'room-3', active: true })
  const signin = await api(request, 'POST', '/api/staff/signin', { pin: '5566' })
  expect(signin.status, 'the new PIN signs in').toBe(200)
  expect(signin.body.staff).toMatchObject({ id: hynes.id, role: 'teacher', class_id: 'room-3' })

  await page.reload()
  await expect(page.locator(`.staff-row[data-staff="${hynes.id}"]`)).toContainText('Teacher · Room 5')
})

test('the last office PIN cannot be switched off, and the refusal is in words', async ({ page, context, request }) => {
  await openTab(page, context, request, 'staff')
  await tap(page, page.locator('.staff-row[data-staff="st-office"] button.edit-staff'), 'edit Ms. Janes')
  await expect(page.locator('#staff-name')).toHaveValue('Ms. Janes (SAMPLE)')
  await setBox(page, page.locator('#staff-active'), false, 'PIN works off')
  await tap(page, page.locator('#save-staff'), 'save staff')
  await expect(page.locator('#staff-error')).toHaveText('The school needs at least one office PIN.')
  expect((await settings(request)).staff.find((s) => s.id === 'st-office'), 'still active in the API').toMatchObject({ active: true, role: 'admin' })
  await page.reload()
  await expect(page.locator('.staff-row[data-staff="st-office"]')).not.toContainText('PIN off')
})
