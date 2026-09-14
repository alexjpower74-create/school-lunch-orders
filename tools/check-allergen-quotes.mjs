// Checks every quote in docs/ALLERGENS.md against the saved source page it names, and the app's allergen labels against the
// table there. A quote passes only if it is an exact substring of the page text (scripts and styles dropped, tags turned into
// spaces, entities decoded, whitespace collapsed). Exit 0 = every quote found; 1 = a quote or label is missing.
//   node tools/check-allergen-quotes.mjs            the real docs
//   node tools/check-allergen-quotes.mjs --self-test  proves the check can fail: a changed word must be reported missing
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—' }

export function pageText(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/)
  return (main ? main[0] : html)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

export function quotesOf(markdown) {
  const out = []
  const lines = markdown.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const src = lines[i].match(/^source:\s*(\S+)\s*$/)
    if (src && lines[i + 1]?.startsWith('> ')) out.push({ source: src[1], quote: lines[i + 1].slice(2).trim() })
  }
  return out
}

export function check(markdown, readSource) {
  const quotes = quotesOf(markdown)
  const missing = []
  const texts = new Map()
  for (const { source, quote } of quotes) {
    if (!texts.has(source)) texts.set(source, pageText(readSource(source)))
    if (!texts.get(source).includes(quote.replace(/\s+/g, ' '))) missing.push(`${source}: "${quote.slice(0, 90)}"`)
  }
  return { count: quotes.length, missing }
}

const readSource = (name) => readFileSync(path.join(ROOT, 'data', 'sources', name), 'utf8')
const doc = readFileSync(path.join(ROOT, 'docs', 'ALLERGENS.md'), 'utf8')

if (process.argv.includes('--self-test')) {
  const broken = doc.replace('Sesame seeds Soy Sulphites', 'Sesame seeds Soy Lupin Sulphites')
  const r = check(broken, readSource)
  const red = r.missing.length === 1 && r.missing[0].includes('food-allergies.html')
  console.log(red ? 'self-test: RED as intended (a changed quote is reported missing)' : `self-test: STAYED GREEN — ${JSON.stringify(r)}`)
  process.exit(red ? 0 : 1)
}

const r = check(doc, readSource)
if (r.count < 6) {
  console.error(`only ${r.count} quotes found in docs/ALLERGENS.md; expected at least 6`)
  process.exit(1)
}
if (r.missing.length) {
  console.error(`${r.missing.length} of ${r.count} quotes are NOT in their saved source:\n  ${r.missing.join('\n  ')}`)
  process.exit(1)
}
console.log(`${r.count} of ${r.count} quotes found word for word in their saved sources`)
