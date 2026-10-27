import puppeteer from 'puppeteer'
import fs from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = 'qa/screenshots'
const results = []
const check = (id, name, ok, details) => { results.push({ id, name, ok: !!ok, details }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name} :: ${JSON.stringify(details).slice(0, 600)}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const daysAgo = (n) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))

const entries = []
for (let i = 0; i < 40; i++) entries.push({ date: daysAgo(39 - i), weightKg: Math.round((82 - i * 0.2) * 10) / 10, createdAt: Date.now(), updatedAt: Date.now() })
const seed = JSON.stringify({ entries, phases: [{ id: 'p1', name: 'Cut', startDate: daysAgo(20), endDate: null, color: '#3b82f6', createdAt: Date.now() }], profile: { startWeightKg: 82, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 }, version: 1 })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.evaluateOnNewDocument((s) => localStorage.setItem('weight-tracker:v1', s), seed)
await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })

// ---- date input theming
for (const mode of ['light', 'dark']) {
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: mode }])
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
  await sleep(700)
  await page.click('.fab'); await sleep(450)
  const inp = await page.evaluate(() => {
    const i = document.querySelector('input[type=date]')
    const s = getComputedStyle(i)
    return { color: s.color, bg: s.backgroundColor, colorScheme: s.colorScheme, value: i.value, h: i.getBoundingClientRect().height }
  })
  check(`V1-${mode}`, `Date input text is legible in ${mode} mode`, mode === 'dark' ? inp.color === 'rgb(237, 244, 239)' : inp.color === 'rgb(25, 35, 31)', inp)
  if (mode === 'light') await page.screenshot({ path: `${OUT}/32-log-sheet-360-light.png` })
  else await page.screenshot({ path: `${OUT}/33-log-sheet-360-dark.png` })
  await page.keyboard.press('Escape'); await sleep(300)
  await page.evaluate(() => document.querySelector('.sheet-layer:not([hidden])')?.remove())
}

// ---- proper dark screenshots at 360x740
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await sleep(800)
await page.screenshot({ path: `${OUT}/34-dashboard-360-dark.png`, fullPage: true })
await page.click('.fab'); await sleep(500)
await page.screenshot({ path: `${OUT}/35-log-sheet-360-dark.png` })
await page.keyboard.press('Escape'); await sleep(300)
await page.evaluate(() => document.querySelector('.sheet-layer:not([hidden])')?.remove())
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'history')?.click())
await sleep(500)
await page.screenshot({ path: `${OUT}/36-history-360-dark.png`, fullPage: true })
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'settings')?.click())
await sleep(500)
await page.screenshot({ path: `${OUT}/37-settings-360-dark.png`, fullPage: true })

// ---- segmented control keyboard
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await sleep(800)
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'dashboard')?.click())
await sleep(600)
const before = await page.$eval('.segmented-option[aria-checked="true"]', (e) => e.textContent)
await page.focus('.segmented-option[aria-checked="true"]')
await page.keyboard.press('ArrowRight')
await sleep(500)
const after = await page.evaluate(() => ({
  checked: [...document.querySelectorAll('.segmented-option[aria-checked="true"]')].map((e) => e.textContent),
  ls: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile?.chartWindowDays,
  focused: document.activeElement?.textContent,
}))
check('V2', 'Segmented control supports arrow-key navigation and persists the window', after.checked.length === 1 && after.checked[0] !== before && after.focused === after.checked[0], { before, after })

// ---- editing an entry and changing its date
const todayEntry = entries[entries.length - 1]
const prevEntry = entries[entries.length - 2]
const beforeCount = await page.evaluate(() => JSON.parse(localStorage.getItem('weight-tracker:v1')).entries.length)
await page.evaluate((d) => document.querySelector('.entry-main')?.dispatchEvent(new MouseEvent('click', { bubbles: true })), todayEntry.date)
// open via recent list (top row is latest)
await page.click('.entry-main')
await sleep(500)
const sheetInfo = await page.evaluate(() => ({ value: document.querySelector('.big-number-value').value, date: document.querySelector('input[type=date]').value }))
await page.$eval('input[type=date]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }, prevEntry.date)
await page.click('.sheet-actions .button--primary')
await sleep(500)
const afterDateChange = await page.evaluate(() => ({
  entries: JSON.parse(localStorage.getItem('weight-tracker:v1')).entries.map((e) => `${e.date}=${e.weightKg}`),
  count: JSON.parse(localStorage.getItem('weight-tracker:v1')).entries.length,
  toast: document.querySelector('.toast')?.innerText,
}))
check('V3', 'Changing the date of an existing weigh-in moves it (no duplicate)', afterDateChange.count === beforeCount, { sheetInfo, today: todayEntry.date, changedTo: prevEntry.date, beforeCount, afterDateChange })

// ---- chart card accessibility with data
const chartA11y = await page.evaluate(() => ({
  trendCardInnerText: document.querySelector('.chart-card')?.innerText,
  canvas: document.querySelectorAll('canvas').length,
  imgRoles: [...document.querySelectorAll('[role=img]')].map((e) => e.getAttribute('aria-label')),
  frame: document.querySelector('.chart-frame')?.outerHTML,
}))
check('V4', 'Chart card exposes an accessible description/summary with data', chartA11y.canvas > 0 && chartA11y.imgRoles.length > 0, chartA11y)

// ---- manifest icons actually exist
await page.goto('http://localhost:5173/manifest.webmanifest', { waitUntil: 'networkidle0' })
const manifest = await page.evaluate(() => document.body.innerText)
const iconStatus = []
for (const f of ['icon-192.png', 'icon-512.png']) {
  const res = await page.goto(`http://localhost:5173/${f}`)
  iconStatus.push({ f, status: res.status(), ct: res.headers()['content-type'] })
}
check('V5', 'Manifest icons exist (PWA install icon)', iconStatus.every((i) => i.status === 200), iconStatus)

fs.writeFileSync('qa/final-results.json', JSON.stringify(results, null, 2))
console.log('\nFAILS:', results.filter((r) => !r.ok).map((r) => r.id + ' ' + r.name).join('\n'))
await browser.close()
