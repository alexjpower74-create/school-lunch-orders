// /kitchen/labels/?date=: one label per active line (GET /api/kitchen/labels), 2⅝ × 1 inch, 3 across on Letter paper.
// Labels are drawn at their printed size on screen too (inches and points are the same CSS pixels on screen and paper), so fit()
// measures the real print geometry. A label whose words would be cut off gets denser type, then "More allergies: see the kitchen
// list" in place of its other allergies, then a one-line item and class. The ALLERGY line is never shortened; a label that still
// does not fit is counted in #labels-too-full.
import { h, listWords, plural } from '../../common/ui.js'
import { $, classWords, handled, showError, staffApi, startStaffPage } from '../../staff/staff.js'

// Shorter allergen names for a 1-inch label only; the kitchen page keeps the full ones.
const LABEL_SHORT = { gluten: 'Gluten' }

function labelWords(info) {
  const labels = new Map(info.allergens.map((a) => [a.key, LABEL_SHORT[a.key] || a.label]))
  return (keys) => listWords(keys.map((k) => labels.get(k) || k))
}

function label(l, words, sample) {
  let allergy = null
  if (l.conflicts.length) {
    const others = l.allergies.filter((k) => !l.conflicts.includes(k))
    allergy = [
      h('div', { class: 'label-allergen' }, `ALLERGY: ${words(l.conflicts)}`,
        l.acknowledged ? null : h('span', { class: 'label-unconfirmed' }, ' (not confirmed)')),
      others.length
        ? h('div', { class: 'label-allergies', dataset: { full: `Also: ${words(others)}`, fallback: 'More allergies: see the kitchen list' } }, `Also: ${words(others)}`)
        : null,
    ]
  } else if (l.allergies.length) {
    const full = `Allergies on file: ${words(l.allergies)}`
    allergy = h('div', { class: 'label-allergies', dataset: { full, fallback: 'Allergies on file: see the kitchen list' } }, full)
  }
  return h('article', { class: 'label', dataset: { line: l.line_id } },
    h('div', { class: 'label-top' }, h('span', { class: 'label-name' }, l.first_name), sample ? h('span', { class: 'label-sample' }, 'SAMPLE') : null),
    h('div', { class: 'label-class' }, classWords(l.class_name, l.grade)),
    h('div', { class: 'label-item' }, `${l.item_name} ×${l.qty}`),
    allergy)
}

const overflows = (el) => el.scrollHeight > el.clientHeight + 1

/** Make one label's words fit its 1-inch box. Returns false when even the last step does not fit. */
function fit(el) {
  el.classList.remove('dense')
  for (const n of el.querySelectorAll('.shorten')) n.classList.remove('shorten')
  const also = el.querySelector('.label-allergies')
  if (also) also.textContent = also.dataset.full
  const steps = [
    () => el.classList.add('dense'),
    () => { if (also) also.textContent = also.dataset.fallback },
    () => el.querySelector('.label-item')?.classList.add('shorten'),
    () => el.querySelector('.label-class')?.classList.add('shorten'),
  ]
  for (const step of steps) {
    if (!overflows(el)) return true
    step()
  }
  return !overflows(el)
}

function fitAll() {
  let tooFull = 0
  for (const el of document.querySelectorAll('#labels .label')) {
    const ok = fit(el)
    el.dataset.fit = ok ? 'ok' : 'too-full'
    if (!ok) tooFull++
  }
  const note = $('#labels-too-full')
  note.hidden = tooFull === 0
  note.textContent = tooFull
    ? `${plural(tooFull, 'label is', 'labels are')} too full to print every word. Check those children on the kitchen list.`
    : ''
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
  const words = labelWords(ctx.info)
  $('#labels').replaceChildren(...data.labels.map((l) => label(l, words, data.sample)))
  await document.fonts?.ready
  fitAll()
  // Measure again whenever print media applies (the geometry is the same, but fonts or zoom could differ).
  matchMedia('print').addEventListener('change', fitAll)
  addEventListener('beforeprint', fitAll)
}

main().catch((err) => showError($('#labels-error'), err))
