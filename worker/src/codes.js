// Family codes: 8 characters without look-alikes, shown as XXXX-XXXX, stored only as a SHA-256 of the 8 characters. Pure.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** " kq7m 4rtx " → "KQ7M4RTX"; null when it cannot be a code. Case-insensitive; spaces and dashes are ignored. */
export function normalizeCode(input) {
  if (typeof input !== 'string') return null
  const s = input.toUpperCase().replace(/[\s-]/g, '')
  if (s.length !== 8) return null
  return [...s].every((ch) => CODE_ALPHABET.includes(ch)) ? s : null
}

export const formatCode = (s) => `${s.slice(0, 4)}-${s.slice(4)}`

/** A new random code, formatted. Rejection sampling keeps every character equally likely. */
export function newCode() {
  const n = CODE_ALPHABET.length
  const limit = 256 - (256 % n)
  let out = ''
  while (out.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < limit && out.length < 8) out += CODE_ALPHABET[b % n]
    }
  }
  return formatCode(out)
}
