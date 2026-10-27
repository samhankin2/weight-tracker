// Smoke test the production build: load, log a weight, import a list, check the chart.
import puppeteer from 'puppeteer'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = process.argv[2] ?? 'http://localhost:4173'

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2 })

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

// --- Load ---
const resp = await page.goto(BASE, { waitUntil: 'networkidle0' })
check('page loads', resp?.ok() === true, `status ${resp?.status()}`)
await page.waitForSelector('.app-shell', { timeout: 10000 })
check('app shell renders', true)

const noGarbage = await page.evaluate(() => !document.body.innerText.includes('\uFFFD'))
check('no corrupted text', noGarbage)

// --- Service worker ---
const swReady = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration()
  return !!reg
})
check('service worker registered', swReady)

// --- Log a weight ---
await page.click('.fab')
await page.waitForSelector('.sheet-panel.is-open, .sheet-panel', { timeout: 5000 })
// Focus lands on the next animation frame; give it a moment.
await new Promise((r) => setTimeout(r, 400))
const focusedIsInput = await page.evaluate(
  () => document.activeElement?.classList.contains('big-number-value') ?? false,
)
check('weight field focused on open', focusedIsInput)

await page.evaluate(() => {
  const input = document.querySelector('.big-number-value')
  input.value = '74.5'
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('.sheet-actions button')]
  buttons.find((b) => b.textContent.includes('Save'))?.click()
})
await new Promise((r) => setTimeout(r, 400))

const headline = await page.$eval('.headline-number', (n) => n.textContent?.trim())
check('weight saved to headline', headline === '74.5', `got "${headline}"`)

const stored = await page.evaluate(() => {
  const raw = localStorage.getItem('weight-tracker:v1')
  return raw ? JSON.parse(raw).entries.length : 0
})
check('entry persisted', stored === 1, `${stored} entries`)

// --- Chart renders ---
await new Promise((r) => setTimeout(r, 800))
const chart = await page.evaluate(() => {
  const canvas = document.querySelector('#weight-chart')
  if (!canvas) return null
  const url = canvas.toDataURL()
  return { present: true, w: canvas.width, h: canvas.height, bytes: url.length }
})
check('chart canvas present and non-blank', !!chart && chart.bytes > 8000, JSON.stringify(chart))

// --- Import a list ---
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.tab-button')]
  tabs.find((t) => t.textContent.includes('Settings'))?.click()
})
await new Promise((r) => setTimeout(r, 400))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Import a list'),
  )
  btn?.click()
})
await page.waitForSelector('.import-textarea', { timeout: 5000 })
check('import sheet opens', true)

await page.evaluate(() => {
  const ta = document.querySelector('.import-textarea')
  ta.value = '5 Mar 2026 74.5\n12 Mar 2026 74.8\n19 Mar 2026 75.1 after gym'
  ta.dispatchEvent(new Event('input', { bubbles: true }))
})
await new Promise((r) => setTimeout(r, 300))
const importLabel = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sheet-actions button')]
  return btns.find((b) => b.textContent.includes('Import'))?.textContent?.trim()
})
check('import button enabled with count', importLabel === 'Import 3', `got "${importLabel}"`)

await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sheet-actions button')]
  btns.find((b) => b.textContent.includes('Import'))?.click()
})
await new Promise((r) => setTimeout(r, 400))
const afterImport = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('weight-tracker:v1'))
  return { count: raw.entries.length, dates: raw.entries.map((e) => e.date).sort() }
})
// 3 imported + the one logged manually above.
check('three entries imported', afterImport.count === 4, JSON.stringify(afterImport))

// --- Conflict overwrite ---
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  btns.find((b) => b.textContent.includes('Import a list'))?.click()
})
await page.waitForSelector('.import-textarea', { timeout: 5000 })
await page.evaluate(() => {
  const ta = document.querySelector('.import-textarea')
  ta.value = '5 Mar 2026 76.0'
  ta.dispatchEvent(new Event('input', { bubbles: true }))
})
await new Promise((r) => setTimeout(r, 300))
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sheet-actions button')]
  btns.find((b) => b.textContent.includes('Import'))?.click()
})
await new Promise((r) => setTimeout(r, 400))
const conflict = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('weight-tracker:v1'))
  return {
    count: raw.entries.length,
    mar5: raw.entries.filter((e) => e.date === '2026-03-05').map((e) => e.weightKg),
  }
})
// 3 imported + the one logged manually above; the overwrite replaces 5 Mar,
// it does not add an entry.
check(
  'pasted value overwrites, no duplicate',
  conflict.count === 4 && conflict.mar5.length === 1 && conflict.mar5[0] === 76,
  JSON.stringify(conflict),
)

// --- Reload persistence ---
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 600))
const afterReload = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('weight-tracker:v1'))
  return raw.entries.length
})
check('data survives reload', afterReload === 4, `${afterReload} entries`)

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
