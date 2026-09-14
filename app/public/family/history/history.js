// "/family/history/" The family's ledger (orders, cancellations, closure credits, payments; undone ones struck through) and
// their lunches with status and whether they were given out.
import { $, balancePhrase, familyApi, getInfo, h, money, renderHeader, requireSession, run } from '../family.js'

const s = requireSession()
const DELIVERY = { delivered: 'Given out', absent: 'Absent' }

function entryRow(e) {
  return h('li', { class: `entry${e.voided ? ' voided' : ''}`, dataset: { entry: e.id, kind: e.kind } },
    h('span', { class: 'when' }, e.at_label),
    h('span', { class: 'label' }, e.label, e.note ? h('span', { class: 'muted small' }, ` (${e.note})`) : null,
      e.voided ? h('span', { class: 'pill', style: 'margin-left:8px;text-decoration:none' }, 'Undone') : null),
    h('span', { class: `amount money${e.amount_cents < 0 ? ' credit' : ''}` }, money(e.amount_cents)))
}

function lineRow(l) {
  const statusClass = { active: 'open', cancelled: 'closed', closed: 'no-school' }[l.status]
  return h('li', { class: 'line line-row', dataset: { line: l.id, status: l.status } },
    h('span', { class: 'what' }, h('strong', {}, l.date_label), ` ${l.first_name}, ${l.item_name} ×${l.qty}`),
    h('span', { class: 'money' }, money(l.total_cents)),
    h('span', { class: `pill ${statusClass}` }, l.status_label),
    l.delivery ? h('span', { class: `pill ${l.delivery}` }, DELIVERY[l.delivery]) : null)
}

async function start() {
  if (!s) return
  const [info, fam, ledger, orders] = await Promise.all([getInfo(), familyApi('GET', '/api/family'), familyApi('GET', '/api/family/ledger'),
    familyApi('GET', '/api/family/orders')])
  renderHeader(info)
  const cents = ledger.balance_cents
  $('balance').dataset.balanceCents = String(cents)
  $('balance').classList.toggle('owing', cents > 0)
  $('balance').classList.toggle('credit', cents < 0)
  $('balance-text').textContent = balancePhrase(cents)
  $('payment-instructions').textContent = cents > 0 ? fam.payment_instructions : ''
  $('ledger').replaceChildren(...(ledger.entries.length ? ledger.entries.map(entryRow) : [h('li', { class: 'line-row muted' }, 'Nothing yet.')]))
  const lines = [...orders.lines].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  $('lines').replaceChildren(...(lines.length ? lines.map(lineRow) : [h('li', { class: 'line-row muted' }, 'No lunches yet.')]))
  $('loading').hidden = true
  $('history').hidden = false
}

run(start)
