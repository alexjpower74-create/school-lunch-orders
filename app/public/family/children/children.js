// "/family/children/" Add, edit and remove children: first name, class, allergies ticked from the school's list.
import { $, ApiError, allergenTools, classWords, familyApi, getInfo, h, icon, renderHeader, requireSession, run, say } from '../family.js'

const s = requireSession()
const state = { info: null, tools: null, children: [], classes: [], editing: null }

function fieldErrors(clearOnly, e) {
  for (const el of document.querySelectorAll('#child-form .field-error')) say(el, '')
  say($('child-error'), '')
  if (clearOnly) return
  const target = e?.field && document.querySelector(`#child-form .field-error[data-for="${e.field}"]`)
  if (target) say(target, e.message)
  else say($('child-error'), e?.message || 'Something went wrong. Try again.')
}

function renderList() {
  const list = $('child-list')
  list.hidden = false
  if (!state.children.length) {
    list.replaceChildren(h('li', { class: 'line-row muted' }, 'No children yet. Add each child below.'))
    return
  }
  list.replaceChildren(...state.children.map((c) => {
    const actions = h('div', { class: 'row' })
    const error = h('p', { class: 'error row-error', role: 'alert', hidden: true })
    const showButtons = () => actions.replaceChildren(
      h('button', { class: 'btn edit-child', type: 'button', onclick: () => startEdit(c) }, 'Edit'),
      h('button', { class: 'btn warn remove-child', type: 'button', onclick: askRemove }, 'Remove'))
    function askRemove() {
      say(error, '')
      actions.replaceChildren(h('div', { class: 'confirm' },
        h('p', {}, `Remove ${c.first_name}? Lunches already given out stay in your history.`),
        h('button', { class: 'btn primary confirm-remove', type: 'button', onclick: doRemove }, 'Yes, remove'),
        h('button', { class: 'btn keep-child', type: 'button', onclick: showButtons }, 'Keep')))
    }
    async function doRemove(ev) {
      ev.currentTarget.disabled = true
      try {
        await familyApi('DELETE', `/api/family/children/${c.id}`)
        await reload()
      } catch (e) {
        showButtons()
        say(error, e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
      }
    }
    showButtons()
    return h('li', { class: 'child-row line-row', dataset: { child: c.id } },
      h('div', { class: 'what' },
        h('h3', {}, c.first_name),
        h('p', { class: 'where' }, classWords(c)),
        c.allergies.length
          ? h('div', { class: 'pills' }, c.allergies.map((k) => h('span', { class: 'pill allergy' }, state.tools.label(k))))
          : h('p', { class: 'muted small', style: 'margin:0' }, 'No allergies ticked')),
      actions, error)
  }))
}

function renderForm() {
  $('class').replaceChildren(h('option', { value: '' }, 'Choose a class'),
    ...state.classes.map((k) => h('option', { value: k.id }, `${k.name} · ${k.grade}`)))
  $('allergy-list').replaceChildren(...state.info.allergens.map((a) => h('label', { class: 'check-row' },
    h('input', { type: 'checkbox', name: 'allergy', value: a.key }),
    h('span', { class: 'box' }, icon('check')),
    h('span', {}, a.label))))
  $('child-form').hidden = false
}

function fillForm(child) {
  state.editing = child
  $('form-title').textContent = child ? `Edit ${child.first_name}` : 'Add a child'
  $('first-name').value = child?.first_name || ''
  $('class').value = child?.class_id || ''
  for (const box of document.querySelectorAll('input[name="allergy"]')) box.checked = !!child?.allergies.includes(box.value)
  $('cancel-edit').hidden = !child
  fieldErrors(true)
}

function startEdit(child) {
  fillForm(child)
  say($('child-saved'), '')
  $('child-form').scrollIntoView({ block: 'start' })
  $('first-name').focus({ preventScroll: true })
}

async function reload() {
  const fam = await familyApi('GET', '/api/family')
  state.children = fam.children
  state.classes = fam.classes
  renderList()
}

async function save(ev) {
  ev.preventDefault()
  const body = {
    first_name: $('first-name').value,
    class_id: $('class').value,
    allergies: [...document.querySelectorAll('input[name="allergy"]:checked')].map((b) => b.value),
  }
  fieldErrors(true)
  say($('child-saved'), '')
  if (!body.first_name.trim()) return fieldErrors(false, { field: 'first_name', message: "Type your child's first name." })
  if (!body.class_id) return fieldErrors(false, { field: 'class_id', message: "Choose your child's class." })
  $('save-child').disabled = true
  try {
    const editing = state.editing
    const answer = editing
      ? await familyApi('PUT', `/api/family/children/${editing.id}`, body)
      : await familyApi('POST', '/api/family/children', body)
    await reload()
    fillForm(null)
    say($('child-saved'), `Saved ${answer.child.first_name}.`)
  } catch (e) {
    fieldErrors(false, e instanceof ApiError ? e : null)
  } finally {
    $('save-child').disabled = false
  }
}

async function start() {
  if (!s) return
  const [info, fam] = await Promise.all([getInfo(), familyApi('GET', '/api/family')])
  state.info = info
  state.tools = allergenTools(info)
  state.children = fam.children
  state.classes = fam.classes
  renderHeader(info)
  renderList()
  renderForm()
  fillForm(null)
  $('child-form').addEventListener('submit', save)
  $('cancel-edit').addEventListener('click', () => fillForm(null))
  $('loading').hidden = true
}

run(start)
