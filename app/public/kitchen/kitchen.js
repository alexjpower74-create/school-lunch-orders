// /kitchen/: one day's totals by item and class, and every child's lunch with allergy rows first. GET /api/kitchen/day.
import { h, plural } from '../common/ui.js'
import { $, allergenWords, classWords, clearMessage, handled, showError, staffApi, startStaffPage } from '../staff/staff.js'

let info
let day
let mode = 'next' // 'next' (no date: the API's next school day) | 'today' | 'pick'

// Conflict rows, then allergy-on-file rows, then the rest. The sort is stable, so the API's class and name order stays inside
// each group.
const FLAG_RANK = { conflict: 0, allergy: 1 }
const rank = (child) => FLAG_RANK[child.flag] ?? 2

async function load(date, nextMode) {
  const q = date ? `?date=${encodeURIComponent(date)}` : ''
  try {
    day = await staffApi('GET', `/api/kitchen/day${q}`)
  } catch (err) {
    if (!handled(err)) showError($('#kitchen-error'), err)
    return
  }
  clearMessage($('#kitchen-error'))
  mode = nextMode
  const url = new URL(location.href)
  if (date) url.searchParams.set('date', day.date)
  else url.searchParams.delete('date')
  history.replaceState(null, '', url)
  render()
}

function render() {
  $('#kitchen-date').textContent = day.is_today ? `${day.long_label} (today)` : day.long_label
  $('#date-pick').value = day.date
  $('#date-next').setAttribute('aria-pressed', String(mode === 'next'))
  $('#date-today').setAttribute('aria-pressed', String(mode === 'today' || (mode === 'pick' && day.is_today)))
  $('#print-labels').href = `/kitchen/labels/?date=${day.date}`

  const open = $('#orders-open')
  open.hidden = !day.orders_open
  open.textContent = day.orders_open
    ? `Orders are still open until ${String(day.cutoff_label || '').replace(/^Order by /, '')}. These numbers can still change.`
    : ''

  const banner = $('#no-school')
  banner.hidden = day.status === 'school_day'
  if (day.status !== 'school_day') {
    const note = day.no_school?.note ? ` ${day.no_school.note}.` : ''
    banner.textContent = `No school: ${day.no_school?.kind_label || day.status_label}.${note} Nothing to make for ${day.date_label}.`
  }

  const flagged = day.children.filter((c) => c.flag).length
  const conflicts = day.children.filter((c) => c.flag === 'conflict').length
  $('#stat-items').textContent = day.totals.item_count
  $('#stat-children').textContent = day.totals.children
  $('#stat-flagged').textContent = flagged
  $('#stat-conflicts').textContent = conflicts ? `${conflicts} with an allergen in the lunch` : ''

  renderItems()
  renderClasses()
  renderChildren()
}

function renderItems() {
  const body = $('#item-totals tbody')
  if (!day.items.length) {
    body.replaceChildren(h('tr', {}, h('td', { class: 'empty', colspan: 2 }, `No menu for ${day.date_label}.`)))
    return
  }
  body.replaceChildren(...day.items.map((it) => h('tr', { class: it.qty === 0 ? 'zero' : null, dataset: { item: it.item_id } },
    h('td', {},
      h('span', { class: 'item-name' }, it.name),
      (it.vegetarian || it.allergens.length) ? h('span', { class: 'tags' },
        it.vegetarian ? h('span', { class: 'pill pill-veg' }, 'Vegetarian') : null,
        it.allergens.length ? h('span', { class: 'pill' }, `Contains ${allergenWords(info, it.allergens)}`) : null) : null),
    h('td', { class: 'qty' }, String(it.qty)))))
}

function renderClasses() {
  const body = $('#class-totals tbody')
  if (!day.classes.length) {
    body.replaceChildren(h('tr', {}, h('td', { class: 'empty', colspan: 3 }, 'No lunches ordered.')))
    return
  }
  body.replaceChildren(...day.classes.map((c) => h('tr', { dataset: { class: c.class_id } },
    h('td', {}, h('strong', {}, c.name), h('span', { class: 'sub' }, `${c.grade} · ${plural(c.children, 'child', 'children')}`)),
    h('td', {}, c.items.map((it) => `${it.name} ×${it.qty}`).join(', ')),
    h('td', { class: 'qty' }, String(c.qty)))))
}

function flagCell(child) {
  if (child.flag === 'conflict') {
    const conflicting = new Set(child.lines.flatMap((l) => l.conflicts))
    const others = child.allergies.filter((k) => !conflicting.has(k))
    return h('td', {},
      h('span', { class: 'pill pill-allergy' }, 'ALLERGY'),
      child.lines.filter((l) => l.conflicts.length).map((l) => h('span', { class: 'flag-line' },
        h('span', { class: 'allergy-words' }, `${allergenWords(info, l.conflicts)} in ${l.item_name}`),
        l.acknowledged ? null : h('span', { class: 'unconfirmed' }, ' · Not confirmed by the parent'))),
      others.length ? h('span', { class: 'sub' }, `Also allergic to: ${allergenWords(info, others)}`) : null)
  }
  if (child.flag === 'allergy') {
    return h('td', {},
      h('span', { class: 'pill pill-allergy-file' }, 'Allergy on file'),
      h('span', { class: 'flag-line allergy-words' }, allergenWords(info, child.allergies)),
      h('span', { class: 'sub' }, 'Nothing in this lunch lists it.'))
  }
  return h('td', { class: 'faint' }, 'None ticked')
}

function renderChildren() {
  const body = $('#children tbody')
  const rows = [...day.children].sort((a, b) => rank(a) - rank(b))
  if (!rows.length) {
    body.replaceChildren(h('tr', {}, h('td', { class: 'empty', colspan: 3 }, `No lunches ordered for ${day.date_label}.`)))
    return
  }
  body.replaceChildren(...rows.map((c) => h('tr', { class: 'child-row', dataset: { child: c.child_id, flag: c.flag || 'none' } },
    h('td', {}, h('strong', {}, c.first_name), h('span', { class: 'sub' }, classWords(c.class_name, c.grade))),
    h('td', {}, c.lines.map((l) => h('span', { class: 'lunch-line' }, `${l.item_name} ×${l.qty}`))),
    flagCell(c))))
}

async function main() {
  const ctx = await startStaffPage('kitchen')
  if (!ctx) return
  info = ctx.info
  $('#date-next').addEventListener('click', () => load(null, 'next'))
  $('#date-today').addEventListener('click', () => load(day?.today || info.today, 'today'))
  $('#date-pick').addEventListener('change', (e) => { if (e.target.value) load(e.target.value, 'pick') })
  const date = new URL(location.href).searchParams.get('date')
  await load(date, date ? 'pick' : 'next')
}

main().catch((err) => showError($('#kitchen-error'), err))
