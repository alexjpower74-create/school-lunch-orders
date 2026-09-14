// "/family/order/" Pick a child, a day and items. The red warning and "I understand, add it" are for the selected child's own
// allergies only. The cart lives in localStorage; nothing is ordered until the cart page's Place order.
import {
  $, allergenTools, familyApi, getInfo, h, icon, menuWeek, money, plural, readCart, renderHeader, requireSession, run, sameLine, say,
  warningText, writeCart,
} from '../family.js'

const s = requireSession()
const state = { info: null, tools: null, family: null, week: null, childId: null, date: null, ordered: [], cart: [] }

const child = () => state.family.children.find((c) => c.id === state.childId)
const day = () => state.week.days.find((d) => d.date === state.date)

const DAY_WORDS = { open: 'Open', closed: 'Closed', no_school: 'No school', no_menu: 'No menu' }

function defaultDate(week, wanted) {
  if (wanted && week.days.some((d) => d.date === wanted)) return wanted
  return (week.days.find((d) => d.status === 'open') || week.days.find((d) => d.status === 'closed') || week.days[0]).date
}

async function showWeek(anyDate, wantedDate) {
  state.week = await menuWeek(anyDate)
  state.date = defaultDate(state.week, wantedDate)
}

function saveCart() {
  writeCart(state.family.family.id, state.cart)
}

/** Add or take away one; ack records "I understand" for this child, day and item. */
function change(c, d, item, delta, ack) {
  const key = { child_id: c.id, date: d.date, item_id: item.id }
  const i = state.cart.findIndex((l) => sameLine(l, key))
  if (i < 0) {
    if (delta > 0) state.cart.push({ ...key, qty: delta, allergen_ack: ack === true })
  } else {
    const line = state.cart[i]
    line.qty += delta
    if (ack) line.allergen_ack = true
    if (line.qty <= 0) state.cart.splice(i, 1)
  }
  saveCart()
  const focused = document.activeElement?.className
  renderItems()
  renderCartBar()
  const again = document.querySelector(`.item[data-item="${item.id}"] ${focused?.includes('qty-minus') ? '.qty-minus' : '.qty-plus'}`)
  if (again && !again.disabled) again.focus({ preventScroll: true })
}

function itemCard(d, item, c) {
  const cs = state.tools.conflicts(item.allergens, c.allergies)
  const words = state.tools.words(cs)
  const inCart = state.cart.find((l) => sameLine(l, { child_id: c.id, date: d.date, item_id: item.id }))
  const qty = inCart?.qty || 0
  const already = state.ordered.filter((l) => l.child_id === c.id && l.date === d.date && l.item_id === item.id).reduce((n, l) => n + l.qty, 0)
  const atMax = item.max_per_child !== null && qty + already >= item.max_per_child

  let actions = null
  if (d.status === 'open') {
    const limit = item.max_per_child !== null ? h('p', { class: 'limit' }, atMax ? `That's the most for one day (${item.max_per_child})` : `Up to ${item.max_per_child} a day`) : null
    if (cs.length && !inCart?.allergen_ack) {
      actions = h('div', { class: 'item-actions' }, limit,
        atMax ? null : h('button', { class: 'btn big ack', type: 'button', onclick: () => change(c, d, item, inCart ? 0 : 1, true) }, 'I understand, add it'))
    } else {
      actions = h('div', { class: 'item-actions' }, limit, h('div', { class: 'stepper' },
        h('button', { class: 'btn big qty-minus', type: 'button', disabled: qty === 0, 'aria-label': `One less ${item.name} for ${c.first_name}`,
          onclick: () => change(c, d, item, -1) }, icon('minus')),
        h('output', { class: 'qty money', 'aria-label': `${item.name} for ${c.first_name}` }, String(qty)),
        h('button', { class: 'btn big qty-plus', type: 'button', disabled: atMax, 'aria-label': `One more ${item.name} for ${c.first_name}`,
          onclick: () => change(c, d, item, 1, cs.length > 0) }, icon('plus'))))
    }
  }

  return h('article', { class: 'card item', dataset: { item: item.id }, 'data-conflict': cs.length ? 'true' : null },
    h('div', { class: 'item-head' }, h('h3', {}, item.name), h('span', { class: 'price money' }, money(item.price_cents))),
    h('div', { class: 'pills' },
      item.vegetarian ? h('span', { class: 'pill veg' }, 'Vegetarian') : null,
      item.allergens.map((k) => h('span', { class: `pill allergen-pill${cs.includes(k) ? ' match' : ''}`, dataset: { allergen: k } }, state.tools.label(k)))),
    cs.length ? h('p', { class: 'allergen-warning' }, icon('alert'), h('span', {}, warningText(c.first_name, words, item.name))) : null,
    item.ingredients ? h('details', {}, h('summary', {}, icon('right'), h('span', {}, 'Ingredients')), h('p', {}, item.ingredients)) : null,
    already ? h('p', { class: 'already-ordered' }, `Already ordered for ${c.first_name}: ${already}`) : null,
    actions)
}

function dayStatusWords(d) {
  if (d.status === 'no_school') {
    if (!d.no_school) return 'No school'
    return `No school: ${d.no_school.kind_label}${d.no_school.note ? ` (${d.no_school.note})` : ''}`
  }
  if (d.status === 'no_menu') return 'No menu yet for this day.'
  return d.cutoff_label
}

function renderItems() {
  const d = day()
  const c = child()
  const status = $('day-status')
  status.dataset.status = d.status
  status.textContent = dayStatusWords(d)
  if (!d.items.length) {
    $('items').replaceChildren(h('p', { class: 'muted' }, d.status === 'no_school' ? 'No lunches on this day.' : 'Nothing on the menu yet.'))
    return
  }
  $('items').replaceChildren(...d.items.map((item) => itemCard(d, item, c)))
}

function render() {
  $('child-tabs').replaceChildren(...state.family.children.map((c) => h('button', {
    class: 'btn child-tab', type: 'button', dataset: { child: c.id }, 'aria-pressed': String(c.id === state.childId),
    onclick: () => { state.childId = c.id; render() },
  }, c.first_name)))
  $('week-label').textContent = state.week.week_label
  $('days').replaceChildren(...state.week.days.map((d) => {
    const [dow, ...rest] = d.date_label.split(' ')
    return h('button', {
      class: 'day', type: 'button', dataset: { date: d.date, status: d.status }, 'aria-pressed': String(d.date === state.date),
      onclick: () => { state.date = d.date; render() },
    }, h('span', { class: 'dow' }, dow), ' ', h('span', {}, rest.join(' ')), ' ', h('span', { class: 'st' }, DAY_WORDS[d.status]))
  }))
  renderItems()
  renderCartBar()
}

async function renderCartBar() {
  $('cart-bar').hidden = false
  const count = state.cart.reduce((n, l) => n + l.qty, 0)
  $('cart-count').textContent = plural(count, 'item')
  let total = 0
  for (const l of state.cart) {
    const week = await menuWeek(l.date).catch(() => null)
    const item = week?.days.find((x) => x.date === l.date)?.items.find((i) => i.id === l.item_id)
    total += item ? item.price_cents * l.qty : 0
  }
  $('cart-total').textContent = money(total)
}

async function start() {
  if (!s) return
  const params = new URLSearchParams(location.search)
  const [info, family] = await Promise.all([getInfo(), familyApi('GET', '/api/family')])
  Object.assign(state, { info, family, tools: allergenTools(info), cart: readCart(family.family.id) })
  renderHeader(info)
  $('loading').hidden = true
  if (!family.children.length) {
    $('no-children').hidden = false
    return
  }
  $('rule').textContent = info.cutoff_rule_label
  state.childId = family.children.some((c) => c.id === params.get('child')) ? params.get('child') : family.children[0].id
  const [orders] = await Promise.all([
    familyApi('GET', `/api/family/orders?from=${info.today}`),
    showWeek(params.get('date') || '', params.get('date')),
  ])
  state.ordered = orders.lines.filter((l) => l.status === 'active')

  $('prev-week').append(icon('left'))
  $('next-week').append(icon('right'))
  $('prev-week').addEventListener('click', async () => { await showWeek(state.week.prev_week); render() })
  $('next-week').addEventListener('click', async () => { await showWeek(state.week.next_week); render() })
  addEventListener('storage', (ev) => {
    if (ev.key === `school-lunch:cart:${family.family.id}`) { state.cart = readCart(family.family.id); render() }
  })
  $('ordering').hidden = false
  render()
}

run(start)
