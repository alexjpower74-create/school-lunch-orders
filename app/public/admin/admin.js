// /admin/: settings for the office PIN. Tabs: school, menu (week grid), no-school days (preview → confirm → result), items,
// classes, staff PINs. Everything reads GET /api/admin/settings and saves through the routes in docs/API.md.
import { h, money, plural } from '../common/ui.js'
import {
  $, $$, allergenWords, busy, classWords, clearMessage, dollarsValue, handled, parseDollars, showError, staffApi, startStaffPage,
} from '../staff/staff.js'

const TABS = ['school', 'menu', 'days', 'items', 'classes', 'staff']
const DAY_WORDS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const ROLE_WORDS = { admin: 'Office and settings', kitchen: 'Kitchen', teacher: 'Teacher' }
let info
let settings
let menu = null
let pendingNoSchool = null
const editing = { item: null, class: null, staff: null }

function fail(el, err) {
  if (!handled(err)) showError(el, err)
}
function flash(el, text) {
  el.textContent = text
  el.hidden = false
}

/** Mark the input an API refusal names (`field`), and show the words. fields: { apiField: '#input' } */
function fieldError(el, err, fields) {
  for (const sel of Object.values(fields)) $(sel)?.removeAttribute('aria-invalid')
  if (err?.field && fields[err.field]) $(fields[err.field]).setAttribute('aria-invalid', 'true')
  fail(el, err)
}

async function reloadSettings() {
  settings = await staffApi('GET', '/api/admin/settings')
}

// ---------- tabs ----------
function showTab(tab) {
  if (!TABS.includes(tab)) tab = 'school'
  for (const b of $$('button.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === tab))
  for (const t of TABS) $(`#panel-${t}`).hidden = t !== tab
  history.replaceState(null, '', `#${tab}`)
  if (tab === 'menu' && !menu) loadMenu(info.today)
}

// ---------- school ----------
function renderSchool() {
  const s = settings.school
  $('#school-name').value = s.school_name
  $('#payment-instructions-input').value = s.payment_instructions
  $('#cutoff-days').value = s.cutoff_days_before
  $('#cutoff-time').value = s.cutoff_time
  $('#year-start').value = s.year_start
  $('#year-end').value = s.year_end
  $('#cutoff-rule').textContent = `Parents see: "${info.cutoff_rule_label}"`
}

async function saveSchool() {
  const error = $('#school-error')
  clearMessage(error)
  clearMessage($('#school-saved'))
  const body = {
    school_name: $('#school-name').value.trim(),
    payment_instructions: $('#payment-instructions-input').value.trim(),
    cutoff_days_before: Number($('#cutoff-days').value),
    cutoff_time: $('#cutoff-time').value.trim(),
    year_start: $('#year-start').value,
    year_end: $('#year-end').value,
  }
  const fields = {
    school_name: '#school-name', payment_instructions: '#payment-instructions-input', cutoff_days_before: '#cutoff-days',
    cutoff_time: '#cutoff-time', year_start: '#year-start', year_end: '#year-end',
  }
  await busy($('#save-school'), async () => {
    try {
      const res = await staffApi('PUT', '/api/admin/school', { body })
      settings.school = res.school
      fieldError(null, null, fields)
      flash($('#school-saved'), 'Saved.')
    } catch (err) {
      fieldError(error, err, fields)
    }
  })
}

// ---------- menu ----------
async function loadMenu(week) {
  try {
    menu = await staffApi('GET', `/api/admin/menu?week=${encodeURIComponent(week)}`)
  } catch (err) {
    fail($('#menu-error'), err)
    return
  }
  renderMenu()
}

function renderMenu() {
  $('#menu-week-label').textContent = menu.week_label
  const items = settings.items.filter((it) => it.active)
  const head = h('thead', {}, h('tr', {},
    h('th', { scope: 'col' }, 'Item'),
    menu.days.map((d) => h('th', { scope: 'col', dataset: { date: d.date } }, d.date_label,
      d.status !== 'school_day'
        ? h('span', { class: 'day-status' }, h('span', { class: 'pill pill-status' }, d.no_school?.kind_label || d.status_label))
        : d.date < info.today ? h('span', { class: 'day-status faint' }, 'Past') : null))))
  const body = h('tbody', {}, items.map((it) => h('tr', { dataset: { item: it.id } },
    h('th', { scope: 'row' }, it.name, h('span', { class: 'item-price' }, money(it.price_cents))),
    menu.days.map((d) => {
      if (d.status !== 'school_day') return h('td', { class: 'off' }, '—')
      const qty = d.ordered?.[it.id] || 0
      const input = h('input', {
        type: 'checkbox', class: 'menu-cell', dataset: { date: d.date, item: it.id },
        'aria-label': `${it.name} on ${d.date_label}`, disabled: d.date < info.today,
      })
      input.checked = d.item_ids.includes(it.id)
      input.addEventListener('change', () => saveMenuDay(d.date, it.id, input))
      return h('td', {}, h('span', { class: 'cell' }, input,
        qty ? h('span', { class: 'ordered', dataset: { date: d.date, item: it.id } }, `${qty} ordered`) : null))
    }))))
  $('#menu-grid').replaceChildren(head, body)
}

async function saveMenuDay(date, itemId, input) {
  const error = $('#menu-error')
  const saved = $('#menu-saved')
  clearMessage(saved)
  const day = menu.days.find((d) => d.date === date)
  const ids = new Set(day.item_ids)
  if (input.checked) ids.add(itemId)
  else ids.delete(itemId)
  const order = settings.items.map((it) => it.id)
  const item_ids = [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  input.disabled = true
  try {
    const res = await staffApi('PUT', `/api/admin/menu/${date}`, { body: { item_ids } })
    Object.assign(day, res.day)
    clearMessage(error)
    flash(saved, `Saved the menu for ${day.date_label}.`)
  } catch (err) {
    fail(error, err)
  }
  renderMenu() // from the saved state: a refused change puts the tick back
}

async function fillWeek() {
  clearMessage($('#menu-saved'))
  await busy($('#fill-week'), async () => {
    try {
      menu = await staffApi('POST', '/api/admin/menu/fill', { body: { week: menu.week_start } })
      clearMessage($('#menu-error'))
      renderMenu()
      flash($('#menu-saved'), `Filled the empty school days of ${menu.week_label} from each item's usual days.`)
    } catch (err) {
      fail($('#menu-error'), err)
    }
  })
}

// ---------- no-school days ----------
function renderNoSchool() {
  $('#no-school-list').replaceChildren(...(settings.no_school_days.length
    ? settings.no_school_days.map((d) => {
      const actions = h('div', { class: 'actions' })
      const showRemove = () => actions.replaceChildren(
        h('button', { type: 'button', class: 'btn btn-quiet remove-no-school', onclick: askRemove }, 'Remove'))
      function askRemove() {
        actions.replaceChildren(
          h('button', { type: 'button', class: 'btn btn-warn confirm-remove-no-school', onclick: (e) => removeNoSchool(d.date, e.currentTarget) },
            'Yes, remove it'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: showRemove }, 'Keep'))
      }
      if (d.date >= info.today) showRemove()
      return h('li', { class: 'row no-school-row', dataset: { date: d.date } },
        h('div', {}, h('strong', {}, d.date_label), ` · ${d.kind_label}`, d.note ? h('span', { class: 'sub' }, d.note) : null),
        actions)
    })
    : [h('li', { class: 'hint' }, 'No no-school days yet.')]))
}

async function addNoSchool() {
  const error = $('#no-school-error')
  const confirmBox = $('#no-school-confirm')
  clearMessage(error)
  clearMessage($('#no-school-result'))
  confirmBox.hidden = true
  const date = $('#no-school-date').value
  const kind = $('#no-school-kind').value
  const note = $('#no-school-note').value.trim()
  if (!date) {
    showError(error, { message: 'Pick the date first.' })
    return
  }
  await busy($('#add-no-school'), async () => {
    let preview
    try {
      preview = await staffApi('GET', `/api/admin/no-school/preview?date=${encodeURIComponent(date)}`)
    } catch (err) {
      fail(error, err)
      return
    }
    pendingNoSchool = { date, kind, note }
    const kindWords = $('#no-school-kind').selectedOptions[0].textContent
    confirmBox.replaceChildren(
      h('p', {}, h('strong', {}, `Make ${preview.date_label} a no-school day (${kindWords})?`)),
      preview.lines
        ? h('p', { id: 'no-school-preview' }, 'This cancels ',
          h('strong', { id: 'confirm-lunches' }, plural(preview.item_count, 'lunch', 'lunches')), ' for ',
          h('strong', { id: 'confirm-families' }, plural(preview.families, 'family', 'families')), ' and credits ',
          h('strong', { id: 'confirm-credit', class: 'money' }, money(preview.credit_cents)), ' to their balances.')
        : h('p', { id: 'no-school-preview' }, `Nothing is ordered for ${preview.date_label}, so nothing is cancelled or credited.`),
      h('div', { class: 'toolbar' },
        h('button', { type: 'button', class: 'btn btn-primary', id: 'confirm-no-school', onclick: confirmNoSchool }, 'Yes, add the no-school day'),
        h('button', { type: 'button', class: 'btn btn-quiet', id: 'cancel-no-school', onclick: () => { confirmBox.hidden = true; pendingNoSchool = null } }, 'Cancel')))
    confirmBox.hidden = false
  })
}

async function confirmNoSchool(e) {
  if (!pendingNoSchool) return
  const error = $('#no-school-error')
  await busy(e.currentTarget, async () => {
    try {
      const res = await staffApi('POST', '/api/admin/no-school', { body: pendingNoSchool })
      pendingNoSchool = null
      $('#no-school-confirm').hidden = true
      const c = res.cancelled
      flash($('#no-school-result'), c.lines
        ? `${res.day.date_label} is now a no-school day. Cancelled ${plural(c.item_count, 'lunch', 'lunches')} for ${plural(c.families, 'family', 'families')}. Credited ${money(c.credit_cents)}.`
        : `${res.day.date_label} is now a no-school day. Nothing was ordered, so nothing was credited.`)
      $('#no-school-note').value = ''
      await reloadSettings()
      renderNoSchool()
      menu = null
    } catch (err) {
      fail(error, err)
    }
  })
}

async function removeNoSchool(date, button) {
  await busy(button, async () => {
    try {
      await staffApi('DELETE', `/api/admin/no-school/${date}`)
      clearMessage($('#no-school-result'))
      await reloadSettings()
      renderNoSchool()
      menu = null
    } catch (err) {
      fail($('#no-school-error'), err)
    }
  })
}

// ---------- items ----------
function renderItems() {
  $('#item-list').replaceChildren(...settings.items.map((it) => h('li', {
    class: 'row item-row', dataset: { item: it.id }, 'aria-current': editing.item === it.id ? 'true' : null,
  },
  h('div', {},
    h('strong', {}, it.name), ` · ${money(it.price_cents)}`,
    it.active ? null : h('span', { class: 'pill' }, 'Not on offer'),
    h('span', { class: 'sub' }, [
      it.allergens.length ? `Contains ${allergenWords(info, it.allergens)}` : 'No listed allergens',
      it.days.length ? it.days.map((d) => DAY_WORDS[d]).join(', ') : 'No usual days',
      it.max_per_child ? `Max ${it.max_per_child}` : null,
      it.vegetarian ? 'Vegetarian' : null,
    ].filter(Boolean).join(' · '))),
  h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn edit-item', onclick: () => editItem(it.id) }, 'Edit')))))
}

function editItem(id) {
  editing.item = id
  const it = settings.items.find((x) => x.id === id) || {
    name: '', price_cents: null, ingredients: '', allergens: [], vegetarian: false, days: [], max_per_child: null, active: true,
  }
  $('#item-form-title').textContent = id ? `Edit ${it.name}` : 'New item'
  $('#item-name').value = it.name
  $('#item-price').value = it.price_cents === null ? '' : dollarsValue(it.price_cents)
  $('#item-ingredients').value = it.ingredients
  for (const box of $$('input[name="item-allergen"]')) box.checked = it.allergens.includes(box.value)
  for (const box of $$('input[name="item-day"]')) box.checked = it.days.includes(Number(box.value))
  $('#item-max').value = it.max_per_child ?? ''
  $('#item-veg').checked = it.vegetarian
  $('#item-active').checked = it.active
  clearMessage($('#item-error'))
  clearMessage($('#item-saved'))
  renderItems()
  if (id) $('#item-name').focus()
}

async function saveItem() {
  const error = $('#item-error')
  clearMessage(error)
  clearMessage($('#item-saved'))
  const price = parseDollars($('#item-price').value)
  const fields = { name: '#item-name', price_cents: '#item-price', ingredients: '#item-ingredients', max_per_child: '#item-max' }
  if (price === null || price < 0) {
    fieldError(error, { message: 'Type the price in dollars, like 3.50.', field: 'price_cents' }, fields)
    return
  }
  const max = $('#item-max').value.trim()
  const body = {
    name: $('#item-name').value.trim(),
    price_cents: price,
    ingredients: $('#item-ingredients').value.trim(),
    allergens: $$('input[name="item-allergen"]:checked').map((b) => b.value),
    vegetarian: $('#item-veg').checked,
    days: $$('input[name="item-day"]:checked').map((b) => Number(b.value)),
    max_per_child: max === '' ? null : Number(max),
    active: $('#item-active').checked,
  }
  await busy($('#save-item'), async () => {
    try {
      const res = editing.item
        ? await staffApi('PUT', `/api/admin/items/${encodeURIComponent(editing.item)}`, { body })
        : await staffApi('POST', '/api/admin/items', { body })
      await reloadSettings()
      fieldError(null, null, fields)
      editing.item = res.item.id
      renderItems()
      $('#item-form-title').textContent = `Edit ${res.item.name}`
      flash($('#item-saved'), `Saved ${res.item.name}.`)
      menu = null
    } catch (err) {
      fieldError(error, err, fields)
    }
  })
}

// ---------- classes ----------
function renderClasses() {
  $('#class-list').replaceChildren(...settings.classes.map((c) => h('li', {
    class: 'row class-row', dataset: { class: c.id }, 'aria-current': editing.class === c.id ? 'true' : null,
  },
  h('div', {}, h('strong', {}, classWords(c.name, c.grade)), h('span', { class: 'sub' }, `${plural(c.child_count ?? 0, 'child', 'children')} · order ${c.sort}`)),
  h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn edit-class', onclick: () => editClass(c.id) }, 'Edit')))))
}

function editClass(id) {
  editing.class = id
  const c = settings.classes.find((x) => x.id === id) || { name: '', grade: '', sort: settings.classes.length }
  $('#class-form-title').textContent = id ? `Edit ${c.name}` : 'New class'
  $('#class-name').value = c.name
  $('#class-grade').value = c.grade
  $('#class-sort').value = c.sort
  clearMessage($('#class-error'))
  clearMessage($('#class-saved'))
  renderClasses()
}

async function saveClass() {
  const error = $('#class-error')
  clearMessage(error)
  const fields = { name: '#class-name', grade: '#class-grade', sort: '#class-sort' }
  const body = { name: $('#class-name').value.trim(), grade: $('#class-grade').value.trim(), sort: Number($('#class-sort').value) }
  await busy($('#save-class'), async () => {
    try {
      const res = editing.class
        ? await staffApi('PUT', `/api/admin/classes/${encodeURIComponent(editing.class)}`, { body })
        : await staffApi('POST', '/api/admin/classes', { body })
      await reloadSettings()
      fieldError(null, null, fields)
      editing.class = res.class.id
      renderClasses()
      renderStaffClassOptions()
      flash($('#class-saved'), `Saved ${res.class.name}.`)
    } catch (err) {
      fieldError(error, err, fields)
    }
  })
}

// ---------- staff ----------
function renderStaffClassOptions() {
  const select = $('#staff-class')
  const value = select.value
  select.replaceChildren(h('option', { value: '' }, 'No class'), ...settings.classes.map((c) => h('option', { value: c.id }, classWords(c.name, c.grade))))
  select.value = value
}

function renderStaff() {
  const classNames = new Map(settings.classes.map((c) => [c.id, c.name]))
  $('#staff-list').replaceChildren(...settings.staff.map((s) => h('li', {
    class: 'row staff-row', dataset: { staff: s.id }, 'aria-current': editing.staff === s.id ? 'true' : null,
  },
  h('div', {}, h('strong', {}, s.name), s.active ? null : h('span', { class: 'pill' }, 'PIN off'),
    h('span', { class: 'sub' }, [ROLE_WORDS[s.role] || s.role, s.class_id ? classNames.get(s.class_id) : null].filter(Boolean).join(' · '))),
  h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn edit-staff', onclick: () => editStaff(s.id) }, 'Edit')))))
}

function editStaff(id) {
  editing.staff = id
  const s = settings.staff.find((x) => x.id === id) || { name: '', role: 'teacher', class_id: null, active: true }
  $('#staff-form-title').textContent = id ? `Edit ${s.name}` : 'New staff member'
  $('#staff-name').value = s.name
  $('#staff-role').value = s.role
  $('#staff-pin').value = ''
  $('#staff-pin-label').textContent = id ? 'New PIN (leave blank to keep the PIN)' : 'PIN (4 to 6 digits)'
  $('#staff-class').value = s.class_id || ''
  $('#staff-active').checked = s.active
  clearMessage($('#staff-error'))
  clearMessage($('#staff-saved'))
  renderStaff()
}

async function saveStaff() {
  const error = $('#staff-error')
  clearMessage(error)
  const fields = { name: '#staff-name', role: '#staff-role', pin: '#staff-pin', class_id: '#staff-class' }
  const pin = $('#staff-pin').value.trim()
  const body = { name: $('#staff-name').value.trim(), role: $('#staff-role').value, class_id: $('#staff-class').value || null }
  if (pin || !editing.staff) body.pin = pin
  if (editing.staff) body.active = $('#staff-active').checked
  await busy($('#save-staff'), async () => {
    try {
      const res = editing.staff
        ? await staffApi('PUT', `/api/admin/staff/${encodeURIComponent(editing.staff)}`, { body })
        : await staffApi('POST', '/api/admin/staff', { body })
      await reloadSettings()
      fieldError(null, null, fields)
      editing.staff = res.staff.id
      $('#staff-pin').value = ''
      renderStaff()
      flash($('#staff-saved'), `Saved ${res.staff.name}.`)
    } catch (err) {
      fieldError(error, err, fields)
    }
  })
}

// ---------- start ----------
async function main() {
  const ctx = await startStaffPage('admin')
  if (!ctx) return
  info = ctx.info
  await reloadSettings()
  $('#no-school-date').value = info.today // a storm closure is added on the day

  $('#item-allergens').replaceChildren(...settings.allergens.map((a) =>
    h('label', { class: 'check-row' }, h('input', { type: 'checkbox', name: 'item-allergen', value: a.key }), ` ${a.label}`)))
  renderSchool()
  renderNoSchool()
  renderItems()
  editItem(null)
  renderClasses()
  editClass(null)
  renderStaffClassOptions()
  renderStaff()
  editStaff(null)

  for (const b of $$('button.tab')) b.addEventListener('click', () => showTab(b.dataset.tab))
  $('#school-form').addEventListener('submit', (e) => { e.preventDefault(); saveSchool() })
  $('#menu-prev').addEventListener('click', () => menu && loadMenu(menu.prev_week))
  $('#menu-next').addEventListener('click', () => menu && loadMenu(menu.next_week))
  $('#fill-week').addEventListener('click', fillWeek)
  $('#add-no-school').addEventListener('click', addNoSchool)
  $('#new-item').addEventListener('click', () => { editItem(null); $('#item-name').focus() })
  $('#item-form').addEventListener('submit', (e) => { e.preventDefault(); saveItem() })
  $('#new-class').addEventListener('click', () => { editClass(null); $('#class-name').focus() })
  $('#class-form').addEventListener('submit', (e) => { e.preventDefault(); saveClass() })
  $('#new-staff').addEventListener('click', () => { editStaff(null); $('#staff-name').focus() })
  $('#staff-form').addEventListener('submit', (e) => { e.preventDefault(); saveStaff() })
  showTab(location.hash.slice(1))
}

main().catch((err) => fail($('#admin-error'), err))
