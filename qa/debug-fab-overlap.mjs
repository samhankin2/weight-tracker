import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let stamp = Date.now()
const seed = {
  entries: [{ date: '2026-10-26', weightKg: 75.3, createdAt: stamp++, updatedAt: stamp++ }],
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
await page.goto(BASE, { waitUntil: 'networkidle0' })
await page.reload({ waitUntil: 'networkidle0' })
await sleep(800)
await page.click('.tab-button[data-tab="settings"]')
await sleep(500)
const info = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.view--settings button')].find((b) => b.textContent.includes('Manage phases'))
  const r = btn.getBoundingClientRect()
  const fab = document.querySelector('.fab').getBoundingClientRect()
  const point = { x: r.right - 10, y: r.bottom - 10 }
  const hit = document.elementFromPoint(point.x, point.y)
  return {
    button: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    fab: { left: fab.left, right: fab.right, top: fab.top, bottom: fab.bottom },
    point,
    hit: hit ? { tag: hit.tagName, cls: hit.className, aria: hit.getAttribute('aria-label') } : null,
    hitClosestFab: Boolean(hit?.closest('.fab')),
  }
})
console.log('HIT TEST', JSON.stringify(info, null, 2))
// Click at the right end of the button.
await page.mouse.click(info.point.x, info.point.y)
await sleep(500)
const after = await page.evaluate(() => ({
  sheetOpen: Boolean(document.querySelector('.sheet-layer.is-open')),
  sheetTitle: document.querySelector('.sheet-title')?.textContent,
  activeTab: document.querySelector('.tab-button[aria-current="page"]')?.dataset.tab,
}))
console.log('AFTER CLICK RIGHT END', JSON.stringify(after, null, 2))
await browser.close()
