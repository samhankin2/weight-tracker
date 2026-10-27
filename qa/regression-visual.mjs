import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const SHOTS = 'qa/regression/shots'
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = new Date()
const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
const TODAY = daysAgo(0)
let stamp = Date.now()
const entry = (date, weightKg) => ({ date, weightKg, createdAt: stamp++, updatedAt: stamp++ })
const visualEntries = Array.from({ length: 30 }, (_, i) => {
  const offset = 30 - i // ends yesterday
  return entry(daysAgo(offset), Math.round((82 - i * 0.24) * 10) / 10)
})
const visualSeed = {
  entries: visualEntries,
  phases: [{ id: 'p', name: 'Bulk', startDate: daysAgo(14), endDate: null, color: '#f59e0b', createdAt: stamp++ }],
  profile: { startWeightKg: 82, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
  version: 1,
}
const consoleIssues = []
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })

async function open({ theme, width = 360, height = 740, seed = visualSeed, label }) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleIssues.push({ label, type: m.type(), text: m.text() })
  })
  page.on('pageerror', (e) => consoleIssues.push({ label, type: 'pageerror', text: e.message }))
  await page.setViewport({ width, height, isMobile: width < 520, hasTouch: true, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  await page.evaluateOnNewDocument((v) => { try { localStorage.setItem('weight-tracker:v1', v) } catch {} }, JSON.stringify(seed))
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(800)
  return { context, page }
}

// ---- Visual captures, light + dark ---------------------------------------
const sheets = {}
for (const theme of ['light', 'dark']) {
  const { context, page } = await open({ theme, label: `visual-${theme}` })
  await page.screenshot({ path: path.join(SHOTS, `dashboard-360-${theme}.png`), fullPage: true })
  await page.screenshot({ path: path.join(SHOTS, `dashboard-viewport-360-${theme}.png`) })
  await page.click('.fab')
  await sleep(900) // let the sheet settle fully
  const sheet = await page.evaluate(() => {
    const input = document.querySelector('.big-number-value')
    const r = input.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return {
      value: input.value,
      visibility: getComputedStyle(input).visibility,
      hit: hit ? `${hit.tagName}.${hit.className}` : null,
      active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
      formFilled: document.querySelector('.log-sheet')?.textContent.replace(/\s+/g, ' ').trim(),
      saveVisible: (() => {
        const b = document.querySelector('.sheet-actions .button--primary').getBoundingClientRect()
        return b.top >= 0 && b.bottom <= innerHeight
      })(),
    }
  })
  sheets[theme] = sheet
  await page.screenshot({ path: path.join(SHOTS, `sheet-360-${theme}.png`) })
  await page.keyboard.press('Escape')
  await sleep(400)
  await page.click('.tab-button[data-tab="history"]')
  await sleep(500)
  await page.screenshot({ path: path.join(SHOTS, `history-360-${theme}.png`), fullPage: true })
  await page.click('.tab-button[data-tab="settings"]')
  await sleep(500)
  await page.screenshot({ path: path.join(SHOTS, `settings-360-${theme}.png`), fullPage: true })
  await context.close()
}

// ---- Item 13, reliable geometry (sheet open and closed) -------------------
const { context: c13, page: p13 } = await open({ theme: 'light', label: 'item13' })
await p13.click('.fab')
await sleep(900)
await p13.click('.big-number-value')
await sleep(200)
await p13.keyboard.down('Control')
await p13.keyboard.press('KeyA')
await p13.keyboard.up('Control')
await p13.keyboard.type('0.5')
await sleep(150)
await p13.click('.sheet-actions .button--primary')
await sleep(450)
const openToast = await p13.evaluate(() => {
  const toast = document.querySelector('.toast')
  const fab = document.querySelector('.fab').getBoundingClientRect()
  const t = toast.getBoundingClientRect()
  const actions = document.querySelector('.sheet-layer.is-open .sheet-actions')?.getBoundingClientRect()
  return {
    text: toast.textContent.trim(),
    tone: toast.dataset.tone,
    visible: !toast.hidden && toast.classList.contains('is-visible'),
    toast: { left: t.left, right: t.right, top: t.top, bottom: t.bottom },
    fab: { left: fab.left, right: fab.right, top: fab.top, bottom: fab.bottom },
    actionsTop: actions?.top ?? null,
    intersectsFab: t.left < fab.right && t.right > fab.left && t.top < fab.bottom && t.bottom > fab.top,
    aboveActions: !actions || t.bottom <= actions.top + 1,
    pointerEvents: getComputedStyle(toast).pointerEvents,
    entries: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').entries?.length,
  }
})
await p13.screenshot({ path: path.join(SHOTS, 'toast-360-light.png') })
await p13.keyboard.press('Escape')
await sleep(400)
const closedToast = await p13.evaluate(() => {
  const toast = document.querySelector('.toast')
  const fab = document.querySelector('.fab').getBoundingClientRect()
  const t = toast.getBoundingClientRect()
  return {
    visible: !toast.hidden && toast.classList.contains('is-visible'),
    toast: { left: t.left, right: t.right, top: t.top, bottom: t.bottom },
    intersectsFab: t.left < fab.right && t.right > fab.left && t.top < fab.bottom && t.bottom > fab.top,
    focusFab: document.activeElement === document.querySelector('.fab'),
  }
})
await c13.close()
{
  const { context, page } = await open({ theme: 'dark', width: 360, height: 740, label: 'dark-viewport' })
  await page.screenshot({ path: path.join(SHOTS, 'dashboard-top-360-dark.png') })
  await context.close()
}
{
  const { context, page } = await open({ theme: 'light', width: 320, height: 568, label: '320' })
  await page.screenshot({ path: path.join(SHOTS, 'dashboard-320-light.png'), fullPage: true })
  await context.close()
}

await browser.close()
const out = { sheets, openToast, closedToast, consoleIssues }
fs.writeFileSync('qa/regression/visual-results.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
