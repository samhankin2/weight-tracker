// Verify the DEPLOYED site works: assets resolve under the /weight-tracker/ base.
import puppeteer from 'puppeteer'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = process.argv[2] ?? 'https://samhankin2.github.io/weight-tracker/'

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

const errors = []
const failedRequests = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`))
page.on('response', (r) => {
  if (r.status() >= 400) failedRequests.push(`${r.url()} :: HTTP ${r.status()}`)
})

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const resp = await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 45000 })
check('page loads', resp?.ok() === true, `HTTP ${resp?.status()}`)

await page.waitForSelector('.app-shell', { timeout: 15000 })
check('app renders', true)

// Styles actually applied (not an unstyled HTML dump)?
const styled = await page.evaluate(() => {
  const fab = document.querySelector('.fab')
  if (!fab) return null
  const r = fab.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height), pos: getComputedStyle(fab).position }
})
check('CSS loaded (FAB is 60x60, fixed)', styled?.w === 60 && styled?.h === 60 && styled?.pos === 'fixed', JSON.stringify(styled))

// Log a weight via the FAB
await page.click('.fab')
await new Promise((r) => setTimeout(r, 600))
const sheetUp = await page.evaluate(() => !!document.querySelector('.sheet-layer.is-open'))
check('log sheet opens', sheetUp)

await page.evaluate(() => {
  const input = document.querySelector('.big-number-value')
  input.value = '74.5'
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.evaluate(() => {
  ;[...document.querySelectorAll('.sheet-actions button')]
    .find((b) => b.textContent.includes('Save'))
    ?.click()
})
await new Promise((r) => setTimeout(r, 700))
const headline = await page.$eval('.headline-number', (n) => n.textContent?.trim())
check('weight saved', headline === '74.5', `got "${headline}"`)

// Chart rendered
await new Promise((r) => setTimeout(r, 1200))
const chart = await page.evaluate(() => {
  const c = document.querySelector('#weight-chart')
  return c ? { w: c.width, h: c.height, bytes: c.toDataURL().length } : null
})
check('chart rendered', !!chart && chart.bytes > 8000, JSON.stringify(chart))

// Service worker + manifest
const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()))
check('service worker active', sw)

const manifest = await page.evaluate(async () => {
  const res = await fetch('./manifest.webmanifest')
  const j = await res.json()
  return { name: j.name, icons: j.icons.length, start: j.start_url }
})
check('manifest loads', manifest.icons === 4, JSON.stringify(manifest))

// Persistence
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 800))
const persisted = await page.evaluate(() => {
  const raw = localStorage.getItem('weight-tracker:v1')
  return raw ? JSON.parse(raw).entries.length : 0
})
check('data survives reload', persisted === 1, `${persisted} entries`)

// Import sheet reachable
await page.evaluate(() => {
  ;[...document.querySelectorAll('.tab-button')].find((t) => t.textContent.includes('Settings'))?.click()
})
await new Promise((r) => setTimeout(r, 500))
const hasImport = await page.evaluate(() =>
  [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Import a list')),
)
check('import-a-list button present', hasImport)

const realFailures = failedRequests.filter((f) => !f.includes('favicon'))
check('no failed requests', realFailures.length === 0, realFailures.slice(0, 3).join(' | '))
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await page.screenshot({ path: 'qa/deployed-390.png' })
await browser.close()

const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed) process.exit(1)
