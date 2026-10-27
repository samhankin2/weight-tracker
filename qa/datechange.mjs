import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const today = iso(now)
const yesterday = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
const seed = JSON.stringify({
  entries: [
    { date: yesterday, weightKg: 75.1, createdAt: 1, updatedAt: 1 },
    { date: today, weightKg: 74.5, createdAt: 2, updatedAt: 2 },
  ],
  phases: [], profile: { startWeightKg: null, goalWeightKg: null, heightCm: null, unit: 'kg', chartWindowDays: 90 }, version: 1,
})
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await page.evaluateOnNewDocument((s) => localStorage.setItem('weight-tracker:v1', s), seed)
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await sleep(700)

const before = await page.evaluate(() => JSON.parse(localStorage.getItem('weight-tracker:v1')).entries)
await page.click('.entry-main')
await sleep(500)
const sheet = await page.evaluate(() => ({ title: document.querySelector('.sheet-title').textContent, value: document.querySelector('.big-number-value').value, date: document.querySelector('input[type=date]').value }))
// Change the date to the other existing day
await page.$eval('input[type=date]', (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })) }, yesterday)
await sleep(200)
const subtitle = await page.evaluate(() => ({ subtitle: document.querySelector('.sheet-subtitle')?.textContent, label: document.querySelector('.log-date-info .field-label-text')?.textContent }))
await page.click('.sheet-actions .button--primary')
await sleep(500)
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('weight-tracker:v1')).entries)
console.log(JSON.stringify({ before, sheet, subtitle, after }, null, 2))

// same-day overwrite: open yesterday, change back to today
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'history')?.click())
await sleep(400)
await page.screenshot({ path: 'qa/screenshots/38-history-after-date-change.png', fullPage: true })
await browser.close()
