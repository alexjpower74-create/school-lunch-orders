// "/family/cart/" The cart by day, then child. A conflicting line needs its "I understand" tick before Place order works. A
// refusal from the Worker stays on screen, marks the line and removes nothing.
import {
  $, ApiError, allergenTools, balancePhrase, familyApi, getInfo, h, icon, menuWeek, money, readCart, renderHeader, requireSession, run, say,
  warningText, writeCart,
} from '../family.js'

const s = requireSession()
const state = { info: null, tools: null, family: null, cart: [], placing: false }

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// Each cart line with its child, day and item, in the order shown (and sent): date, first name, item name.
async function rows() {
  const out = []
  for (const line of state.cart) {
    const week = await menuWeek(line.date).catch(() => null)
    const d = week?.days.find((x) => x.date === line.date)
    const item = d?.items.find((i) => i.id === line.item_id)
    const c = state.family.children.find((k) => k.id === line.child_id)
    const conflicts = item && c ? state.tools.conflicts(item.allergens, c.allergies) : []
    out.push({ line, day: d, item, child: c, conflicts })
  }
  return out.sort((a, b) => byName(a.line.date, b.line.date) || byName(a.child?.first_name || '', b.child?.first_name || '') ||
    byName(a.item?.name || '', b.item?.name || ''))
}

function save() {
  writeCart(state.family.family.id, state.cart)
}

async function updatePlace() {
  const list = await rows()
  const unticked = list.some((r) => r.conflicts.length && !r.line.allergen_ack)
  $('place-order').disabled = state.placing || !list.length || unticked
  $('cart-total').textContent = money(list.reduce((n, r) => n + (r.item ? r.item.price_cents * r.line.qty : 0), 0))
}

async function render() {
  const list = await rows()
  $('cart-empty').hidden = list.length > 0
  $('cart-content').hidden = list.length === 0
  const days = new Map()
  list.forEach((r, index) => {
    if (!days.has(r.line.date)) days.set(r.line.date, new Map())
    const kids = days.get(r.line.date)
    const name = r.child?.first_name || 'A child no longer on your family'
    if (!kids.has(name)) kids.set(name, [])
    kids.get(name).push({ ...r, index })
  })
  $('cart-lines').replaceChildren(...[...days].map(([date, kids]) => {
    const label = [...kids.values()][0][0].day?.date_label || date
    return h('section', { class: 'cart-day' }, h('h2', {}, label), [...kids].map(([name, items]) => h('div', { class: 'cart-child' },
      h('h3', {}, name), items.map((r) => cartLine(r)))))
  }))
  await updatePlace()
}

function cartLine({ line, item, child, day, conflicts, index }) {
  const words = state.tools.words(conflicts)
  const problem = !item ? 'This item is no longer on the menu for that day.' : day && day.status !== 'open' ? day.cutoff_label || day.status_label : ''
  return h('article', { class: 'card cart-line', dataset: { child: line.child_id, date: line.date, item: line.item_id, index: String(index) } },
    h('div', { class: 'line-main' },
      h('span', { class: 'what' }, `${item?.name || line.item_id} ×${line.qty}`),
      h('span', { class: 'money' }, item ? money(item.price_cents * line.qty) : ''),
      h('button', { class: 'btn remove-line', type: 'button', 'aria-label': `Remove ${item?.name || 'this item'} for ${child?.first_name || 'this child'}`,
        onclick: () => {
          state.cart = state.cart.filter((l) => l !== line)
          save()
          render()
        } }, 'Remove')),
    conflicts.length ? h('p', { class: 'allergen-warning' }, icon('alert'), h('span', {}, warningText(child.first_name, words, item.name))) : null,
    conflicts.length ? h('label', { class: 'check-row' },
      h('input', { type: 'checkbox', class: 'ack-check', checked: line.allergen_ack === true, onchange: (ev) => {
        line.allergen_ack = ev.currentTarget.checked
        save()
        updatePlace()
      } }),
      h('span', { class: 'box' }, icon('check')),
      h('span', {}, `I understand ${child.first_name} is allergic to ${words}`)) : null,
    problem ? h('p', { class: 'line-problem' }, problem) : null)
}

function showPlaced(answer) {
  $('cart-content').hidden = true
  $('order-placed').hidden = false
  $('placed-total').textContent = money(answer.order.total_cents)
  $('new-balance').dataset.balanceCents = String(answer.balance_cents)
  $('new-balance').textContent = balancePhrase(answer.balance_cents)
  $('payment-instructions').textContent = state.info.payment_instructions
  $('order-placed').scrollIntoView({ block: 'start' })
}

function showRefusal(e) {
  say($('order-error'), e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
  const indexes = Array.isArray(e?.body?.lines) ? e.body.lines.map((l) => l.index) : Number.isInteger(e?.body?.index) ? [e.body.index] : []
  for (const i of indexes) document.querySelector(`.cart-line[data-index="${i}"]`)?.setAttribute('data-error', e.code)
  $('order-error').scrollIntoView({ block: 'center' })
}

async function placeOrder() {
  const list = await rows()
  state.placing = true
  await updatePlace()
  say($('order-error'), '')
  for (const el of document.querySelectorAll('.cart-line[data-error]')) el.removeAttribute('data-error')
  try {
    const answer = await familyApi('POST', '/api/family/orders', {
      lines: list.map((r) => ({ child_id: r.line.child_id, date: r.line.date, item_id: r.line.item_id, qty: r.line.qty, allergen_ack: r.line.allergen_ack === true })),
    })
    state.cart = []
    save()
    showPlaced(answer)
  } catch (e) {
    showRefusal(e)
  } finally {
    state.placing = false
    await updatePlace()
  }
}

async function start() {
  if (!s) return
  const [info, family] = await Promise.all([getInfo(), familyApi('GET', '/api/family')])
  Object.assign(state, { info, family, tools: allergenTools(info), cart: readCart(family.family.id) })
  renderHeader(info)
  $('place-order').addEventListener('click', placeOrder)
  await render()
  $('loading').hidden = true
}

run(start)
