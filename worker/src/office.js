// The office: families, codes, payments, adjustments, undo, and the CSV exports (docs/API.md "Office").
import { codeHash, randomId } from './auth.js'
import { newCode } from './codes.js'
import { CHILD_SELECT, childOut, intField, loadCal, readJson, textField } from './db.js'
import { amountCell, csvText, textCell } from './csv.js'
import { bad, conflict, json, notFound } from './http.js'
import { ENTRY_KIND_WORDS, METHODS, METHOD_LABELS, balanceOf, entryOut, insertEntry, paymentLabel } from './ledger.js'
import { LINE_ORDER, LINE_SELECT, lineOut } from './lines.js'
import { dateLabel, isValidDate, localDate, timeLabel } from './time.js'

const LABEL_MSG = 'Type a name for the family (up to 60 characters).'

async function familiesWithBalances(db) {
  const [f, ch] = await db.batch([
    db.prepare(`SELECT f.id, f.label,
      COALESCE((SELECT SUM(e.amount_cents) FROM entries e WHERE e.family_id = f.id AND e.voided = 0), 0) AS balance_cents,
      (SELECT MAX(e.at) FROM entries e WHERE e.family_id = f.id AND e.kind = 'payment' AND e.voided = 0) AS last_payment_at
      FROM families f`),
    db.prepare(`${CHILD_SELECT} WHERE ch.removed = 0 ORDER BY ch.first_name, ch.seq`),
  ])
  const kids = new Map()
  for (const r of ch.results) {
    if (!kids.has(r.family_id)) kids.set(r.family_id, [])
    kids.get(r.family_id).push({ id: r.id, first_name: r.first_name, class_name: r.class_name ?? '' })
  }
  return f.results.map((r) => ({
    id: r.id, label: r.label, children: kids.get(r.id) || [], balance_cents: r.balance_cents, last_payment_at: r.last_payment_at ?? null,
    last_payment_label: r.last_payment_at ? dateLabel(localDate(r.last_payment_at)) : null,
  })).sort((a, b) => b.balance_cents - a.balance_cents || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
}

export async function officeFamilies(c) {
  const families = await familiesWithBalances(c.db)
  return json({
    families,
    totals: {
      families: families.length,
      owing_cents: families.reduce((s, f) => s + Math.max(0, f.balance_cents), 0),
      credit_cents: families.reduce((s, f) => s + Math.min(0, f.balance_cents), 0),
    },
  })
}

async function uniqueCode(db) {
  for (;;) {
    const code = newCode()
    const hash = await codeHash(code)
    if (!(await db.prepare('SELECT id FROM families WHERE code_hash = ?').bind(hash).first())) return { code, hash }
  }
}

export async function addFamily(c) {
  const body = await readJson(c)
  const label = textField(body, 'label', 1, 60, LABEL_MSG)
  const { code, hash } = await uniqueCode(c.db)
  const id = randomId('fam')
  await c.db.prepare('INSERT INTO families (id, label, code_hash, created_at) VALUES (?, ?, ?, ?)').bind(id, label, hash, c.nowIso).run()
  return json({ family: { id, label }, code }, 201)
}

async function familyOr404(c, id) {
  const f = await c.db.prepare('SELECT id, label FROM families WHERE id = ?').bind(id).first()
  if (!f) throw notFound("That family isn't on the list.")
  return f
}

export async function renameFamily(c, { id }) {
  await familyOr404(c, id)
  const label = textField(await readJson(c), 'label', 1, 60, LABEL_MSG)
  await c.db.prepare('UPDATE families SET label = ? WHERE id = ?').bind(label, id).run()
  return json({ family: { id, label } })
}

export async function newFamilyCode(c, { id }) {
  await familyOr404(c, id)
  const { code, hash } = await uniqueCode(c.db)
  await c.db.batch([
    c.db.prepare('UPDATE families SET code_hash = ? WHERE id = ?').bind(hash, id),
    c.db.prepare("DELETE FROM sessions WHERE kind = 'family' AND subject_id = ?").bind(id),
  ])
  return json({ code })
}

export async function familyDetail(c, { id }) {
  const family = await familyOr404(c, id)
  const cal = await loadCal(c.db)
  const [ch, en, ln] = await c.db.batch([
    c.db.prepare(`${CHILD_SELECT} WHERE ch.family_id = ? AND ch.removed = 0 ORDER BY ch.first_name, ch.seq`).bind(id),
    c.db.prepare('SELECT * FROM entries WHERE family_id = ? ORDER BY seq DESC').bind(id),
    c.db.prepare(`${LINE_SELECT} WHERE l.family_id = ? AND l.status = 'active' AND l.date >= ? ${LINE_ORDER}`).bind(id, c.today),
  ])
  const lines = ln.results.map((r) => lineOut(r, cal, c.now))
  const entries = en.results.map(entryOut)
  return json({
    family, children: ch.results.map(childOut), balance_cents: entries.reduce((s, e) => (e.voided ? s : s + e.amount_cents), 0), entries,
    upcoming: { lines, total_cents: lines.reduce((s, l) => s + l.total_cents, 0) },
  })
}

async function familyForMoney(c, body) {
  if (typeof body.family_id !== 'string') throw bad('family_id', 'Choose a family.')
  return familyOr404(c, body.family_id)
}

export async function recordPayment(c) {
  const body = await readJson(c)
  const fam = await familyForMoney(c, body)
  const amount = intField(body, 'amount_cents', 1, 1000000, 'Type the amount received, between $0.01 and $10,000.00.')
  if (!METHODS.includes(body.method)) throw bad('method', 'Choose how it was paid.')
  const note = textField(body, 'note', 0, 200, 'Keep the note under 200 characters.')
  const id = randomId('ent')
  await insertEntry(c.db, { id, family_id: fam.id, at: c.nowIso, kind: 'payment', amount_cents: -amount, label: paymentLabel(body.method),
    method: body.method, note }).run()
  const entry = await c.db.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first()
  return json({ entry: entryOut(entry), balance_cents: await balanceOf(c.db, fam.id) }, 201)
}

export async function recordAdjustment(c) {
  const body = await readJson(c)
  const fam = await familyForMoney(c, body)
  const amount = intField(body, 'amount_cents', -1000000, 1000000, 'Type an amount that is not zero, up to $10,000.00 either way.')
  if (amount === 0) throw bad('amount_cents', 'Type an amount that is not zero, up to $10,000.00 either way.')
  const note = textField(body, 'note', 1, 200, 'Say why in the note (up to 200 characters).')
  const id = randomId('ent')
  await insertEntry(c.db, { id, family_id: fam.id, at: c.nowIso, kind: 'adjustment', amount_cents: amount, label: 'Adjustment', note }).run()
  const entry = await c.db.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first()
  return json({ entry: entryOut(entry), balance_cents: await balanceOf(c.db, fam.id) }, 201)
}

export async function voidEntry(c, { id }) {
  const e = await c.db.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first()
  if (!e) throw notFound("That entry isn't in the ledger.")
  if (e.kind !== 'payment' && e.kind !== 'adjustment') throw conflict('bad_state', 'Only payments and adjustments can be undone.')
  if (e.voided) throw conflict('bad_state', 'That entry is already undone.')
  await c.db.prepare('UPDATE entries SET voided = 1, voided_at = ? WHERE id = ? AND voided = 0').bind(c.nowIso, id).run()
  return json({ entry: entryOut({ ...e, voided: 1 }), balance_cents: await balanceOf(c.db, e.family_id) })
}

const csvResponse = (text, filename) => new Response(text, {
  headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' },
})

export async function ledgerCsv(c) {
  const cal = await loadCal(c.db)
  const q = (k) => c.url.searchParams.get(k)
  const from = q('from') || cal.school.year_start || c.today
  const to = q('to') || c.today
  if (!isValidDate(from)) throw bad('from', 'Choose a start date.')
  if (!isValidDate(to)) throw bad('to', 'Choose an end date.')
  const { results } = await c.db.prepare(`SELECT e.*, f.label AS family_label FROM entries e JOIN families f ON f.id = e.family_id
    WHERE e.date BETWEEN ? AND ? ORDER BY e.at, e.seq`).bind(from, to).all()
  const rows = [['Date', 'Time', 'Family', 'Kind', 'Description', 'Amount', 'Method', 'Note', 'Voided'].map(textCell)]
  for (const e of results) {
    rows.push([textCell(e.date), textCell(timeLabel(e.at)), textCell(e.family_label), textCell(ENTRY_KIND_WORDS[e.kind]), textCell(e.label),
      amountCell(e.amount_cents), textCell(e.method ? METHOD_LABELS[e.method] : ''), textCell(e.note), textCell(e.voided ? 'yes' : '')])
  }
  return csvResponse(csvText(rows), `lunch-ledger-${from}-to-${to}.csv`)
}

export async function balancesCsv(c) {
  const families = await familiesWithBalances(c.db)
  const rows = [['Family', 'Children', 'Balance'].map(textCell)]
  for (const f of families) {
    rows.push([textCell(f.label), textCell(f.children.map((k) => `${k.first_name} (${k.class_name})`).join('; ')), amountCell(f.balance_cents)])
  }
  return csvResponse(csvText(rows), `lunch-balances-${c.today}.csv`)
}
