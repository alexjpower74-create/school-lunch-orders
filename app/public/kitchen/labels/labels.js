// /kitchen/labels/?date=: one label per active line (GET /api/kitchen/labels), printed 3 across.
import { h, plural } from '../../common/ui.js'
import { $, allergenWords, classWords, handled, showError, staffApi, startStaffPage } from '../../staff/staff.js'

function label(l, info, sample) {
  let allergy = null
  if (l.conflicts.length) {
    allergy = h('div', { class: 'label-allergen' },
      `ALLERGY: ${allergenWords(info, l.allergies)}. Contains ${allergenWords(info, l.conflicts)}.`,
      l.acknowledged ? null : h('span', { class: 'label-unconfirmed' }, ' Not confirmed by the parent.'))
  } else if (l.allergies.length) {
    allergy = h('div', { class: 'label-allergies' }, `Allergies on file: ${allergenWords(info, l.allergies)}`)
  }
  return h('article', { class: 'label', dataset: { line: l.line_id } },
    h('div', { class: 'label-top' }, h('span', { class: 'label-name' }, l.first_name), sample ? h('span', { class: 'label-sample' }, 'SAMPLE') : null),
    h('div', { class: 'label-class' }, classWords(l.class_name, l.grade)),
    h('div', { class: 'label-item' }, `${l.item_name} ×${l.qty}`),
    allergy)
}

async function main() {
  const ctx = await startStaffPage('kitchen')
  if (!ctx) return
  $('#print').addEventListener('click', () => window.print())
  const date = new URL(location.href).searchParams.get('date')
  let data
  try {
    data = await staffApi('GET', `/api/kitchen/labels${date ? `?date=${encodeURIComponent(date)}` : ''}`)
  } catch (err) {
    if (!handled(err)) showError($('#labels-error'), err)
    return
  }
  $('#back-kitchen').href = `/kitchen/?date=${data.date}`
  $('#labels-date').textContent = `${plural(data.labels.length, 'label')} for ${data.date_label}`
  const empty = $('#labels-empty')
  empty.hidden = data.labels.length > 0
  empty.textContent = data.labels.length ? '' : `No lunches to label for ${data.date_label}.`
  $('#print').disabled = data.labels.length === 0
  $('#labels').replaceChildren(...data.labels.map((l) => label(l, ctx.info, data.sample)))
}

main().catch((err) => showError($('#labels-error'), err))
