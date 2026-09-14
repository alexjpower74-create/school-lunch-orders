// Small shared helpers for every page. Lead-owned: slices import them and ask the lead for changes in their build report.
// Money is integer cents everywhere; these functions only format it.

/** 350 → "$3.50", -300 → "-$3.00", 0 → "$0.00" */
export function money(cents) {
  const n = Math.round(Number(cents) || 0)
  const abs = Math.abs(n)
  const dollars = Math.floor(abs / 100).toLocaleString('en-CA')
  return `${n < 0 ? '-' : ''}$${dollars}.${String(abs % 100).padStart(2, '0')}`
}

/** A parent's balance in plain words: "You owe $12.50" / "You have a $3.00 credit" / "All paid up". */
export function balancePhrase(cents) {
  if (cents > 0) return `You owe ${money(cents)}`
  if (cents < 0) return `You have a ${money(-cents)} credit`
  return 'All paid up'
}

/** The office's short form: "Owes $12.50" / "Credit $3.00" / "Paid up". */
export function balanceShort(cents) {
  if (cents > 0) return `Owes ${money(cents)}`
  if (cents < 0) return `Credit ${money(-cents)}`
  return 'Paid up'
}

/** "1 item" / "3 items" */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** ["Milk"] → "Milk"; ["Eggs", "Milk"] → "Eggs and Milk"; ["Eggs", "Milk", "Mustard"] → "Eggs, Milk and Mustard" */
export function listWords(words) {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** Escape text for HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/**
 * h('button', { class: 'ack', dataset: { item: 'mac' }, onclick }, 'I understand, add it')
 * Attributes: class, dataset, on* handlers, boolean true/false, anything else as an attribute. Children: strings, nodes, arrays, null.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
    else if (v === true) el.setAttribute(k, '')
    else el.setAttribute(k, String(v))
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}
