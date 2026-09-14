// Plain-English helpers shared by the Worker modules. Pure.

/** ["Milk"] → "Milk"; ["Eggs", "Milk"] → "Eggs and Milk"; three or more → "Eggs, Milk and Mustard" */
export function listWords(words) {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** "1 item" / "3 items" */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** 1250 → "$12.50" (only for messages; JSON fields stay in cents) */
export function dollars(cents) {
  const a = Math.abs(cents)
  return `${cents < 0 ? '-' : ''}$${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`
}

export const parseList = (text) => {
  try {
    const v = JSON.parse(text || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
