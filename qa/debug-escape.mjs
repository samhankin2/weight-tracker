import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = new Date()
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
let stamp = Date.now()
const seed = {
  entries: [{ date: daysAgo(1), weightKg: 75.3, createdAt: stamp++, updatedAt: stamp++ }],
  phases: [],
  profile: { startWeightKg: 82, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
  version: 1,
}
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const context = await browser.createBrowserContext()
const page = await context.newPage()
await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true })
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
await page.evaluateOnNewDocument((v) => { try { localStorage.setItem('weight-tracker:v1', v) } catch {} }, JSON.stringify(seed))
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await page.reload({ waitUntil: 'networkidle0' })
await sleep(800)
await page.click('.fab')
await sleep(700)
// Force focus outside the sheet, as the old bug did (on the FAB).
await page.evaluate(() => document.querySelector('.fab').focus())
const before = await page.evaluate(() => ({
  open: Boolean(document.querySelector('.sheet-layer.is-open')),
  active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
}))
await page.keyboard.press('Escape')
await sleep(400)
const after = await page.evaluate(() => ({
  open: Boolean(document.querySelector('.sheet-layer.is-open')),
  layers: document.querySelectorAll('.sheet-layer').length,
  active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
  bodyOverflow: document.body.style.overflow,
}))
// Tab from outside should ideally not escape; check what happens.
await page.click('.fab')
await sleep(700)
await page.evaluate(() => document.querySelector('.fab').focus())
await page.keyboard.press('Tab')
const tabFromOutside = await page.evaluate(() => ({
  active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
  inPanel: Boolean(document.activeElement?.closest('.sheet-panel')),
  open: Boolean(document.querySelector('.sheet-layer.is-open')),
}))
console.log(JSON.stringify({ before, after, tabFromOutside }, null, 2))
await browser.close()
