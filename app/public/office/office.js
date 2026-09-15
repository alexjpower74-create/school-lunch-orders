// /office/: family balances (GET /api/office/families), one family's ledger, record / undo payments, adjustments, family codes
// shown once, CSV downloads. Money is integer cents; typed dollars are parsed without floating point.
import { balanceShort, h, money, plural } from '../common/ui.js'
import {
  $, allergenWords, busy, classWords, clearMessage, dollarsValue, downloadCsv, handled, parseDollars, showError, staffApi, startStaffPage,
} from '../staff/staff.js'

const METHODS = [['etransfer', 'e-Transfer'], ['cash', 'Cash'], ['cheque', 'Cheque'], ['other', 'Other']]
let info
let list
let detail = null // the open family's GET /api/office/families/:id answer

const balanceClass = (cents) => (cents > 0 ? 'owing' : cents < 0 ? 'credit' : 'paid')
const balancePill = (cents, attrs = {}) =>
  h('span', { ...attrs, class: `pill balance ${balanceClass(cents)}`, dataset: { balanceCents: String(cents) } }, balanceShort(cents))

function fail(el, err) {
  if (!handled(err)) showError(el, err)
}

// ---------- the list ----------
async function loadList() {
  try {
    list = await staffApi('GET', '/api/office/families')
  } catch (err) {
    fail($('#office-error'), err)
    return
  }
  renderList()
}

function renderList() {
  $('#owing-total').textContent = money(list.totals.owing_cents)
  $('#credit-total').textContent = money(-list.totals.credit_cents)
  $('#family-count').textContent = list.totals.families
  $('#families').replaceChildren(...list.families.map((f) => h('li', {},
    h('button', {
      type: 'button', class: 'family-row', dataset: { family: f.id }, 'aria-current': detail?.family.id === f.id ? 'true' : null,
      onclick: () => openFamily(f.id),
    },
    h('span', { class: 'family-label' }, f.label),
    h('span', { class: 'sub' },
      [f.children.map((c) => `${c.first_name} (${c.class_name})`).join(', ') || 'No children added yet',
        f.last_payment_label ? `Last paid ${f.last_payment_label}` : null].filter(Boolean).join(' · ')),
    balancePill(f.balance_cents)))))
}

// ---------- one family ----------
async function openFamily(id) {
  try {
    detail = await staffApi('GET', `/api/office/families/${encodeURIComponent(id)}`)
  } catch (err) {
    fail($('#office-error'), err)
    return
  }
  renderPanel()
  renderList()
  if (matchMedia('(max-width: 899px)').matches) $('#family-panel').scrollIntoView({ block: 'start' })
}

function showCode(slot, code, label) {
  document.getElementById('code-box')?.remove()
  slot.append(h('div', { class: 'code-box', id: 'code-box', role: 'status' },
    h('p', { class: 'hint' }, `Family code for ${label}`),
    h('div', { class: 'code-value', id: 'code-value' }, code),
    h('p', {}, "Write this on the family's paper now. It won't be shown again."),
    h('button', { type: 'button', class: 'btn', id: 'code-done', onclick: () => document.getElementById('code-box')?.remove() }, 'Done, it is written down')))
}

function entryRow(e) {
  const undoable = (e.kind === 'payment' || e.kind === 'adjustment') && !e.voided
  const actions = h('div', { class: 'entry-actions' })
  const error = h('p', { class: 'error entry-error', role: 'alert', hidden: true })
  const showUndo = () => actions.replaceChildren(h('button', { type: 'button', class: 'btn btn-warn void-entry', onclick: askUndo }, 'Undo'))
  function askUndo() {
    actions.replaceChildren(
      h('span', {}, `Undo this ${e.kind}? It stays in the ledger, struck through.`),
      h('button', { type: 'button', class: 'btn btn-warn confirm-void', onclick: (ev) => voidEntry(e.id, ev.currentTarget, error) }, 'Yes, undo it'),
      h('button', { type: 'button', class: 'btn btn-quiet keep-entry', onclick: showUndo }, 'Keep it'))
  }
  if (undoable) showUndo()
  if (e.voided) actions.append(h('span', { class: 'undone' }, 'Undone'))
  return h('li', { class: `entry${e.voided ? ' voided' : ''}`, dataset: { entry: e.id, kind: e.kind } },
    h('div', {},
      h('span', { class: 'entry-label' }, e.label),
      h('span', { class: 'sub' }, [e.at_label, e.note].filter(Boolean).join(' · '))),
    h('span', { class: 'entry-amount money' }, money(e.amount_cents)),
    undoable || e.voided ? actions : null,
    undoable ? error : null)
}

function renderPanel() {
  const panel = $('#family-panel')
  panel.hidden = false
  const d = detail
  const owing = d.balance_cents > 0
  const codeSlot = h('div', { id: 'family-code-slot' })
  const confirmSlot = h('div')
  const codeError = h('p', { id: 'new-code-error', class: 'error', role: 'alert', hidden: true })

  const askNewCode = () => confirmSlot.replaceChildren(h('div', { class: 'confirm' },
    h('p', {}, `A new code stops the old one at once and signs out every phone that used it. Only do this when ${d.family.label} has lost the paper.`),
    h('div', { class: 'toolbar' },
      h('button', { type: 'button', class: 'btn btn-warn', id: 'confirm-new-code', onclick: (ev) => newCode(ev.currentTarget, codeSlot, confirmSlot, codeError) }, 'Yes, make a new code'),
      h('button', { type: 'button', class: 'btn btn-quiet', id: 'cancel-new-code', onclick: () => confirmSlot.replaceChildren() }, 'Cancel'))))

  panel.replaceChildren(
    h('div', { class: 'panel-head' },
      h('div', {},
        h('h2', {}, d.family.label),
        balancePill(d.balance_cents, { id: 'family-balance' })),
      h('button', { type: 'button', class: 'btn btn-quiet', id: 'close-family', onclick: closePanel }, 'Close')),
    h('p', { id: 'payment-done', class: 'saved', role: 'status', hidden: true }),

    h('div', { class: 'panel-section' },
      h('h3', {}, 'Children'),
      d.children.length
        ? h('ul', { class: 'kids' }, d.children.map((c) => h('li', {},
          h('strong', {}, c.first_name), ` · ${classWords(c.class_name, c.grade)}`,
          c.allergies.length ? h('span', { class: 'flag-line allergy-words' }, `Allergies: ${allergenWords(info, c.allergies)}`) : null)))
        : h('p', { class: 'hint' }, 'No children added yet. The family adds them on their phone.'),
      h('p', { class: 'hint' }, d.upcoming.lines.length
        ? `${plural(d.upcoming.lines.length, 'lunch', 'lunches')} ordered for days to come, ${money(d.upcoming.total_cents)}.`
        : 'No lunches ordered for days to come.')),

    h('form', { class: 'panel-section', id: 'payment-form', onsubmit: (ev) => { ev.preventDefault(); recordPayment() } },
      h('h3', {}, 'Record a payment'),
      h('div', { class: 'payment-form' },
        h('label', { class: 'field' }, h('span', {}, 'Amount ($)'),
          h('input', { type: 'text', id: 'payment-amount', inputmode: 'decimal', autocomplete: 'off', placeholder: '12.50', value: owing ? dollarsValue(d.balance_cents) : '' })),
        h('label', { class: 'field' }, h('span', {}, 'How it came'),
          h('select', { id: 'payment-method' }, METHODS.map(([v, l]) => h('option', { value: v }, l)))),
        h('label', { class: 'field wide' }, h('span', {}, 'Note (optional)'),
          h('input', { type: 'text', id: 'payment-note', maxlength: 200, autocomplete: 'off', placeholder: 'Envelope from Liam' })),
        h('button', { type: 'submit', class: 'btn btn-primary wide', id: 'record-payment' }, 'Record payment')),
      h('p', { id: 'payment-error', class: 'error', role: 'alert', hidden: true })),

    h('details', { class: 'panel-section' },
      h('summary', { class: 'btn btn-quiet' }, 'Add an adjustment'),
      h('p', { class: 'hint' }, 'A charge or a credit the office decides on. Type a minus sign for a credit, like -4.00.'),
      h('form', { class: 'payment-form', onsubmit: (ev) => { ev.preventDefault(); recordAdjustment() } },
        h('label', { class: 'field' }, h('span', {}, 'Amount ($)'),
          h('input', { type: 'text', id: 'adjust-amount', inputmode: 'decimal', autocomplete: 'off', placeholder: '-4.00' })),
        h('label', { class: 'field' }, h('span', {}, 'Why'),
          h('input', { type: 'text', id: 'adjust-note', maxlength: 200, autocomplete: 'off', placeholder: 'Absent, lunch credited' })),
        h('button', { type: 'submit', class: 'btn wide', id: 'record-adjustment' }, 'Add adjustment')),
      h('p', { id: 'adjust-error', class: 'error', role: 'alert', hidden: true })),

    h('div', { class: 'panel-section' },
      h('h3', {}, 'Family code'),
      h('p', { class: 'hint' }, 'The code is only shown when it is made. If the family lost the paper, make a new one.'),
      h('button', { type: 'button', class: 'btn', id: 'new-code', onclick: askNewCode }, 'New code'),
      confirmSlot,
      codeError,
      codeSlot),

    h('div', { class: 'panel-section' },
      h('h3', {}, 'Ledger'),
      d.entries.length
        ? h('ul', { class: 'ledger', id: 'ledger' }, d.entries.map(entryRow))
        : h('p', { class: 'hint', id: 'ledger' }, 'Nothing yet.')))
}

function closePanel() {
  detail = null
  $('#family-panel').hidden = true
  renderList()
}

async function recordPayment() {
  const error = $('#payment-error')
  clearMessage(error)
  const cents = parseDollars($('#payment-amount').value)
  if (cents === null || cents <= 0) {
    $('#payment-amount').setAttribute('aria-invalid', 'true')
    showError(error, { message: 'Type the amount that arrived, like 12.50.' })
    return
  }
  const method = $('#payment-method').value
  await busy($('#record-payment'), async () => {
    try {
      const res = await staffApi('POST', '/api/office/payments', {
        body: { family_id: detail.family.id, amount_cents: cents, method, note: $('#payment-note').value.trim() },
      })
      detail.balance_cents = res.balance_cents
      detail.entries = [res.entry, ...detail.entries]
      renderPanel()
      const done = $('#payment-done')
      done.textContent = `Recorded ${money(cents)} (${METHODS.find(([v]) => v === method)[1]}).`
      done.hidden = false
      await loadList()
    } catch (err) {
      fail(error, err)
    }
  })
}

async function recordAdjustment() {
  const error = $('#adjust-error')
  clearMessage(error)
  const cents = parseDollars($('#adjust-amount').value)
  if (!cents) {
    showError(error, { message: 'Type the amount, like 4.00 for a charge or -4.00 for a credit.' })
    return
  }
  // The button is disabled from the first tap until the answer, so a double tap records one adjustment.
  await busy($('#record-adjustment'), async () => {
    try {
      const res = await staffApi('POST', '/api/office/adjustments', {
        body: { family_id: detail.family.id, amount_cents: cents, note: $('#adjust-note').value.trim() },
      })
      detail.balance_cents = res.balance_cents
      detail.entries = [res.entry, ...detail.entries]
      renderPanel()
      await loadList()
    } catch (err) {
      fail(error, err)
    }
  })
}

async function voidEntry(id, button, errorEl) {
  await busy(button, async () => {
    try {
      const res = await staffApi('POST', `/api/office/entries/${encodeURIComponent(id)}/void`)
      detail.balance_cents = res.balance_cents
      detail.entries = detail.entries.map((e) => (e.id === id ? res.entry : e))
      renderPanel()
      await loadList()
    } catch (err) {
      fail(errorEl, err) // next to the entry that was tapped
    }
  })
}

async function newCode(button, codeSlot, confirmSlot, errorEl) {
  await busy(button, async () => {
    try {
      const res = await staffApi('POST', `/api/office/families/${encodeURIComponent(detail.family.id)}/code`)
      confirmSlot.replaceChildren()
      showCode(codeSlot, res.code, detail.family.label)
    } catch (err) {
      fail(errorEl, err) // next to New code
    }
  })
}

async function addFamily() {
  const input = $('#add-family-label')
  const error = $('#add-family-error')
  clearMessage(error)
  const label = input.value.trim()
  if (!label) {
    showError(error, { message: 'Type a name for the family first, like "Liam and Ava".' })
    return
  }
  await busy($('#add-family'), async () => {
    try {
      const res = await staffApi('POST', '/api/office/families', { body: { label } })
      input.value = ''
      showCode($('#add-family-code'), res.code, res.family.label)
      await loadList()
    } catch (err) {
      fail(error, err)
    }
  })
}

async function main() {
  const ctx = await startStaffPage('office')
  if (!ctx) return
  info = ctx.info
  $('#add-family').addEventListener('click', addFamily)
  $('#add-family-label').addEventListener('keydown', (e) => { if (e.key === 'Enter') addFamily() })
  $('#ledger-csv').addEventListener('click', (e) => busy(e.currentTarget, () =>
    downloadCsv('/api/office/ledger.csv', 'lunch-ledger.csv').catch((err) => fail($('#office-error'), err))))
  $('#balances-csv').addEventListener('click', (e) => busy(e.currentTarget, () =>
    downloadCsv('/api/office/balances.csv', 'lunch-balances.csv').catch((err) => fail($('#office-error'), err))))
  await loadList()
}

main().catch((err) => fail($('#office-error'), err))
