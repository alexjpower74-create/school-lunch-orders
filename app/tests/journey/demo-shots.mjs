// Screenshots of the running demo for docs/shots/ (lead-owned; not a test). Start the demo first (`npm run demo`, port 8601),
// then: cd app && node tests/journey/demo-shots.mjs   (BASE=http://127.0.0.1:8601 by default).
// Real sign-in on each page (family code typed, PIN keypad tapped), chromium, phone 390 and desktop 1280, viewport shots.
// It never places an order or changes the demo's data; the parent's cart lives only in this script's browser context.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE || 'http://127.0.0.1:8601'
const OUT = process.env.OUT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'shots')
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const saved = []
async function shot(page, name) {
  await page.waitForTimeout(250)
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, animations: 'disabled' })
  saved.push(path.basename(file))
}
async function context(device) {
  const c = await browser.newContext({ ...device, baseURL: BASE })
  await c.route(
    (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
    (r) => r.abort(),
  )
  return c
}
async function staff(page, pin, landing) {
  await page.goto('/staff/')
  for (const d of pin) await page.locator(`button.key[data-key="${d}"]`).click()
  await page.locator('#pin-submit').click()
  await page.waitForURL(new RegExp(landing))
}

// ---- parent on a phone ----
for (const [device, suffix] of [
  [PHONE, '390'],
  [DESKTOP, '1280'],
]) {
  const c = await context(device)
  const p = await c.newPage()
  await p.goto('/')
  if (suffix === '390') await shot(p, 'parent-signin-390')
  await p.locator('#code').click()
  await p.keyboard.type('KQ7M4RTX')
  await p.locator('#sign-in').click()
  await p.waitForURL(/\/family\/$/)
  await p.locator('#balance-text').waitFor()
  await shot(p, `parent-home-${suffix}`)

  await p.goto('/family/order/')
  await p.locator('button.child-tab[data-child="ch-liam"]').click()
  const open = p.locator('button.day[data-status="open"]').first()
  if (await open.count()) await open.click()
  const conflict = p.locator('.item[data-conflict="true"]').first()
  if (await conflict.count()) {
    await conflict.scrollIntoViewIfNeeded()
    await conflict.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await shot(p, `parent-order-allergy-warning-${suffix}`)
    const ack = conflict.locator('button.ack')
    if (await ack.count()) await ack.click()
    const plain = p.locator('.item:not([data-conflict="true"]) button.qty-plus').first()
    if (await plain.count()) await plain.click()
    await p.locator('#view-cart').click()
    await p.waitForURL(/\/family\/cart\//)
    await shot(p, `parent-cart-${suffix}`)
  }
  await p.goto('/family/history/')
  await p.locator('#ledger').waitFor()
  if (suffix === '390') await shot(p, 'parent-history-390')
  await c.close()
}

// ---- kitchen on a laptop ----
{
  const c = await context(DESKTOP)
  const k = await c.newPage()
  await staff(k, '2718', '/kitchen/')
  await k.locator('#item-totals').waitFor()
  await shot(k, 'kitchen-1280')
  await k.locator('#children').scrollIntoViewIfNeeded()
  await shot(k, 'kitchen-allergy-rows-1280')
  await k.locator('#print-labels').click()
  await k.waitForURL(/\/kitchen\/labels\//)
  await shot(k, 'kitchen-labels-1280')
  await c.close()
}

// ---- teacher on a phone ----
{
  const c = await context(PHONE)
  const t = await c.newPage()
  await staff(t, '1618', '/teacher/')
  await t.locator('#count-waiting').waitFor()
  await shot(t, 'teacher-390')
  await c.close()
}

// ---- office and settings on a laptop ----
{
  const c = await context(DESKTOP)
  const o = await c.newPage()
  await staff(o, '3141', '/office/')
  await o.locator('.family-row').first().waitFor()
  await shot(o, 'office-1280')
  await o.locator('.family-row').first().click()
  await o.locator('#family-panel').waitFor()
  await shot(o, 'office-family-1280')
  await o.goto('/admin/')
  for (const tab of ['menu', 'days', 'items']) {
    // Tap the tab: a goto that only changes the #hash does not reload the page, so the panel would not switch.
    await o.locator(`button.tab[data-tab="${tab}"]`).click()
    await o.locator(`#panel-${tab}`).waitFor()
    await shot(o, `settings-${tab}-1280`)
  }
  await c.close()
}

await browser.close()
console.log(`saved ${saved.length} screenshots to docs/shots/:\n  ${saved.join('\n  ')}`)
