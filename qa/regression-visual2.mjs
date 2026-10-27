import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = new Date()
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
let stamp = Date.now()
const entry = (date, weightKg) => ({ date, weightKg, createdAt: stamp++, updatedAt: stamp++ })
const entries = Array.from({ length: 30 }, (_, i) => entry(daysAgo(30 - i), Math.round((82 - i * 0.24) * 10) / 10))
const seed = {
  entries,
  phases: [{ id: 'p', name: 'Bulk', startDate: daysAgo(14), endDate: null, color: '#f59e0b', createdAt: stamp++ }],
  profile: { startWeightKg: 82, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
  version: 1,
}
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
async function page(theme = 'light') {
  const context = await browser.createBrowserContext()
  const p = await context.newPage()
  await p.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  await p.evaluateOnNewDocument((v) => { try { localStorage.setItem('weight-tracker:v1', v) } catch {} }, JSON.stringify(seed))
  await p.goto(BASE, { waitUntil: 'networkidle0' })
  await p.reload({ waitUntil: 'networkidle0' })
  await sleep(900)
  return { context, p }
}
// Clean full-page captures without fixed overlays.
for (const theme of ['light', 'dark']) {
  const { context, p } = await page(theme)
  await p.addStyleTag({ content: '.fab, .tab-bar { display: none !important; }' })
  await p.screenshot({ path: `qa/regression/shots/clean-dashboard-360-${theme}.png`, fullPage: true })
  await p.evaluate(() => document.querySelector('[aria-label="Goal progress"]').scrollIntoView({ block: 'center' }))
  await sleep(300)
  await p.screenshot({ path: `qa/regression/shots/goal-inview-360-${theme}.png` })
  await p.evaluate(() => document.querySelector('.tab-button[data-tab="history"]').click())
  await sleep(500)
  await p.screenshot({ path: `qa/regression/shots/clean-history-360-${theme}.png`, fullPage: true })
  await p.evaluate(() => document.querySelector('.tab-button[data-tab="settings"]').click())
  await sleep(500)
  await p.screenshot({ path: `qa/regression/shots/clean-settings-360-${theme}.png`, fullPage: true })
  await context.close()
}
// Settings with FAB visible, and a marker rectangle around the overlap.
{
  const { context, p } = await page('light')
  await p.evaluate(() => document.querySelector('.tab-button[data-tab="settings"]').click())
  await sleep(600)
  await p.screenshot({ path: 'qa/regression/shots/settings-fab-overlap-360-light.png' })
  await context.close()
}
// Item 6 free-date move visual: history after move.
{
  const context = await browser.createBrowserContext()
  const p = await context.newPage()
  await p.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  const seed6 = {
    entries: [entry(daysAgo(1), 75.1), entry(daysAgo(0), 74.5)],
    phases: [],
    profile: { startWeightKg: 82, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
    version: 1,
  }
  await p.evaluateOnNewDocument((v) => { try { localStorage.setItem('weight-tracker:v1', v) } catch {} }, JSON.stringify(seed6))
  await p.goto(BASE, { waitUntil: 'networkidle0' })
  await p.reload({ waitUntil: 'networkidle0' })
  await sleep(800)
  await p.click('[aria-label="Recent entries"] .entry-row .entry-main')
  await sleep(500)
  await p.evaluate((value) => {
    const input = document.querySelector('input[aria-label="Date of weigh-in"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, daysAgo(2))
  await sleep(200)
  await p.screenshot({ path: 'qa/regression/shots/edit-date-changed-360-light.png' })
  await p.click('.sheet-actions .button--primary')
  await sleep(700)
  await p.evaluate(() => document.querySelector('.tab-button[data-tab="history"]').click())
  await sleep(500)
  await p.screenshot({ path: 'qa/regression/shots/history-after-move-360-light.png' })
  await context.close()
}
await browser.close()

