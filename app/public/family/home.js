// "/family/" The family's balance, what is coming up (with Cancel before the cut-off) and their children.
import {
  $, ApiError, allergenTools, balancePhrase, classWords, familyApi, getInfo, h, icon, money, renderHeader, requireSession, run, say, signOut, warningText,
} from './family.js'

const s = requireSession()

function renderBalance(cents, instructions) {
  const card = $('balance')
  card.dataset.balanceCents = String(cents)
  card.classList.toggle('owing', cents > 0)
  card.classList.toggle('credit', cents < 0)
  $('balance-text').textContent = balancePhrase(cents)
  $('payment-instructions').textContent = cents > 0 ? instructions : ''
  $('payment-instructions').hidden = !(cents > 0 && instructions)
}

function renderChildren(children, tools) {
  $('children').replaceChildren(...children.map((c) => h('article', { class: 'card child-card', dataset: { child: c.id } },
    h('h3', {}, c.first_name),
    h('p', { class: 'where' }, classWords(c)),
    c.allergies.length
      ? h('div', { class: 'pills', 'aria-label': `${c.first_name}'s allergies` }, c.allergies.map((k) => h('span', { class: 'pill allergy' }, tools.label(k))))
      : h('p', { class: 'muted small', style: 'margin:0' }, 'No allergies ticked'))))
  if (!children.length) $('children').replaceChildren(h('p', { class: 'muted' }, 'No children added yet.'))
}

function lineRow(line, instructions, tools) {
  // Red means allergen on every screen: a lunch holding one of this child's allergens keeps a "Contains Milk" pill, even once the
  // parent has said "I understand".
  const li = h('li', { class: 'line line-row', dataset: { line: line.id } },
    h('span', { class: 'what' }, `${line.first_name}, ${line.item_name} ×${line.qty}`),
    line.conflicts.length ? h('span', { class: 'pill allergen-pill match', dataset: { allergen: line.conflicts.join(' ') } }, `Contains ${tools.words(line.conflicts)}`) : null,
    h('span', { class: 'money' }, money(line.total_cents)))
  const error = h('p', { class: 'error', role: 'alert', hidden: true })
  // An allergy ticked after ordering: the kitchen sees "Not confirmed by the parent", so the parent sees the same red warning.
  const needsAck = !line.acknowledged
  const late = needsAck && line.conflicts.length ? h('div', { class: 'late-allergy' },
    h('p', { class: 'allergen-warning' }, icon('alert'), h('span', {}, warningText(line.first_name, tools.words(line.conflicts), line.item_name))),
    h('p', { class: 'late-note' }, 'You ticked this allergy after ordering.')) : null
  const ackButton = late ? h('button', { class: 'btn big ack-line', type: 'button', onclick: doAck }, 'I understand, keep it') : null
  async function doAck(ev) {
    ev.currentTarget.disabled = true
    say(error, '')
    try {
      const answer = await familyApi('POST', `/api/family/lines/${line.id}/ack`)
      if (answer.line.acknowledged) {
        late.remove()
        ackButton.remove()
      }
    } catch (e) {
      ev.target.disabled = false
      say(error, e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
    }
  }
  if (late) li.append(late)
  if (!line.can_cancel) {
    if (ackButton) li.append(h('div', { class: 'row' }, ackButton), error)
    return li
  }

  const actions = h('div', { class: 'row' })
  const cancelSlot = h('span', { class: 'row' })
  const showCancel = () => cancelSlot.replaceChildren(h('button', { class: 'btn warn cancel-line', type: 'button', onclick: askConfirm }, 'Cancel'))
  function askConfirm() {
    cancelSlot.replaceChildren(h('div', { class: 'confirm' },
      h('p', {}, `Cancel ${line.first_name}'s ${line.item_name} on ${line.date_label}? ${money(line.total_cents)} comes off your balance.`),
      h('button', { class: 'btn primary confirm-cancel', type: 'button', onclick: doCancel }, 'Yes, cancel it'),
      h('button', { class: 'btn keep-line', type: 'button', onclick: showCancel }, 'Keep it')))
    cancelSlot.querySelector('.confirm-cancel').focus()
  }
  async function doCancel(ev) {
    ev.currentTarget.disabled = true
    say(error, '')
    try {
      const answer = await familyApi('POST', `/api/family/lines/${line.id}/cancel`)
      renderBalance(answer.balance_cents, instructions)
      const group = li.closest('.day-group')
      li.remove()
      if (group && !group.querySelector('.line')) group.remove()
      if (!$('upcoming').querySelector('.line')) renderUpcoming([], instructions, tools)
    } catch (e) {
      say(error, e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
      showCancel()
    }
  }
  showCancel()
  actions.append(...[ackButton, cancelSlot].filter(Boolean))
  li.append(actions, error)
  return li
}

function renderUpcoming(lines, instructions, tools) {
  const box = $('upcoming')
  if (!lines.length) {
    box.replaceChildren(h('p', { class: 'muted', style: 'margin:0' }, 'No lunches ordered for the days ahead.'))
    return
  }
  const byDay = new Map()
  for (const l of lines) {
    if (!byDay.has(l.date)) byDay.set(l.date, [])
    byDay.get(l.date).push(l)
  }
  box.replaceChildren(...[...byDay.values()].map((dayLines) => h('section', { class: 'day-group' },
    h('h3', {}, dayLines[0].date_label),
    h('ul', { class: 'list' }, dayLines.map((l) => lineRow(l, instructions, tools))))))
}

async function start() {
  if (!s) return
  const [info, fam] = await Promise.all([getInfo(), familyApi('GET', '/api/family')])
  renderHeader(info)
  const orders = await familyApi('GET', `/api/family/orders?from=${info.today}`)
  const tools = allergenTools(info)
  $('family-label').textContent = fam.family.label.replace(/ \(SAMPLE\)$/, '')
  $('first-steps').hidden = fam.children.length > 0
  $('order-lunches').hidden = fam.children.length === 0
  renderBalance(fam.balance_cents, fam.payment_instructions)
  renderUpcoming(orders.lines.filter((l) => l.status === 'active'), fam.payment_instructions, tools)
  renderChildren(fam.children, tools)
  $('sign-out').addEventListener('click', signOut)
  $('loading').hidden = true
  $('home').hidden = false
}

run(start)
