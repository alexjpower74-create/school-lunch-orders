// /teacher/: a class's lunch list for one day (GET /api/teacher/day); Given out / Absent through POST /api/teacher/mark.
// The counts always come from the API's answer, never from counting rows here.
import { h } from '../common/ui.js'
import { $, allergenWords, classWords, clearMessage, handled, showError, staffApi, startStaffPage } from '../staff/staff.js'

let info
let day
let classId
let date = null // null = today (the API's default)

function renderCounts(counts) {
  $('#count-waiting').textContent = counts.waiting
  $('#count-delivered').textContent = counts.delivered
  $('#count-absent').textContent = counts.absent
}

const canMark = () => day.is_today && day.status === 'school_day'

function row(child) {
  const flag = child.lines.some((l) => l.conflicts.length) ? 'conflict' : child.allergies.length ? 'allergy' : 'none'
  const flagWords = flag === 'conflict'
    ? h('span', { class: 'child-flag' }, h('span', { class: 'pill pill-allergy' }, 'ALLERGY'), ' ',
      h('span', { class: 'allergy-words' }, child.lines.filter((l) => l.conflicts.length)
        .map((l) => `${allergenWords(info, l.conflicts)} in ${l.item_name}`).join('; ')))
    : flag === 'allergy'
      ? h('span', { class: 'child-flag allergy-words' }, `Allergies on file: ${allergenWords(info, child.allergies)}`)
      : null
  const state = child.state || 'waiting'
  return h('li', { class: 'child-row', dataset: { child: child.child_id, state, flag } },
    h('div', {},
      h('span', { class: 'child-name' }, child.first_name),
      h('span', { class: `pill state-pill ${state}` }, child.state_label || 'Waiting'),
      h('span', { class: 'child-lunch' }, child.lines.map((l) => `${l.item_name} ×${l.qty}`).join(', ')),
      flagWords),
    canMark()
      ? h('div', { class: 'marks' },
        ['delivered', 'absent'].map((s) => h('button', {
          type: 'button', class: 'btn mark', dataset: { state: s }, 'aria-pressed': String(child.state === s),
          onclick: (e) => mark(child.child_id, s, e.currentTarget),
        }, s === 'delivered' ? 'Given out' : 'Absent')))
      : null)
}

function render() {
  const cls = day.class
  $('#teacher-date-label').textContent = `${classWords(cls.name, cls.grade)} · ${day.date_label}${day.is_today ? ' (today)' : ''}`
  $('#teacher-date').value = day.date
  $('#class-pick').value = cls.id
  const note = $('#teacher-note')
  if (day.status !== 'school_day') {
    note.textContent = `No school: ${day.no_school?.kind_label || day.status_label}.${day.no_school?.note ? ` ${day.no_school.note}.` : ''}`
  } else if (!day.is_today) {
    note.textContent = `You can mark lunches given out on the day. This list is for ${day.date_label}.`
  } else {
    note.textContent = ''
  }
  note.hidden = !note.textContent
  renderCounts(day.counts)
  const list = $('#class-list')
  list.replaceChildren(...(day.children.length
    ? day.children.map(row)
    : [h('li', { class: 'card empty-list' }, `Nobody in ${cls.name} has a lunch ordered for ${day.date_label}.`)]))
}

async function load() {
  const q = new URLSearchParams({ class_id: classId })
  if (date) q.set('date', date)
  try {
    day = await staffApi('GET', `/api/teacher/day?${q}`)
  } catch (err) {
    if (!handled(err)) showError($('#teacher-error'), err)
    return
  }
  clearMessage($('#teacher-error'))
  const url = new URL(location.href)
  url.searchParams.set('class', classId)
  if (date) url.searchParams.set('date', date)
  else url.searchParams.delete('date')
  history.replaceState(null, '', url)
  render()
}

async function mark(childId, pressed, button) {
  const child = day.children.find((c) => c.child_id === childId)
  const state = child.state === pressed ? null : pressed
  const buttons = [...button.parentElement.querySelectorAll('button')]
  buttons.forEach((b) => { b.disabled = true })
  try {
    const res = await staffApi('POST', '/api/teacher/mark', { body: { date: day.date, child_id: childId, state } })
    day.children = day.children.map((c) => (c.child_id === childId ? res.child : c))
    day.counts = res.counts
    renderCounts(res.counts)
    $(`.child-row[data-child="${CSS.escape(childId)}"]`).replaceWith(row(res.child))
    clearMessage($('#teacher-error'))
  } catch (err) {
    buttons.forEach((b) => { b.disabled = false })
    if (!handled(err)) showError($('#teacher-error'), err)
  }
}

async function main() {
  const ctx = await startStaffPage('teacher')
  if (!ctx) return
  info = ctx.info
  const { classes, my_class_id: mine } = await staffApi('GET', '/api/teacher/classes')
  const params = new URL(location.href).searchParams
  classId = classes.some((c) => c.id === params.get('class')) ? params.get('class') : mine
  date = params.get('date')
  $('#class-pick').replaceChildren(...classes.map((c) => h('option', { value: c.id }, classWords(c.name, c.grade))))
  $('#class-pick').addEventListener('change', (e) => { classId = e.target.value; load() })
  $('#teacher-date').addEventListener('change', (e) => {
    if (!e.target.value) return
    date = e.target.value === info.today ? null : e.target.value
    load()
  })
  await load()
}

main().catch((err) => { if (!handled(err)) showError($('#teacher-error'), err) })
