import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = new Date()
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
let stamp = Date.now()
const entries = Array.from({ length: 40 }, (_, i) => ({
  date: daysAgo(39 - i),
  weightKg: Math.round((82 - i * 0.2) * 10) / 10,
  createdAt: stamp++,
  updatedAt: stamp++,
}))
const seed = {
  entries,
  phases: [{ id: 'p', name: 'Bulk', startDate: daysAgo(14), endDate: null, color: '#f59e0b', createdAt: stamp++ }],
  profile: { startWeightKg: 80, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
  version: 1,
}
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const context = await browser.createBrowserContext()
const page = await context.newPage()
await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
await page.emulateMediaFeatures([
  { name: 'prefers-color-scheme', value: 'light' },
  { name: 'prefers-reduced-motion', value: 'reduce' },
])
await page.evaluateOnNewDocument((v) => { try { localStorage.setItem('weight-tracker:v1', v) } catch {} }, JSON.stringify(seed))
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await page.reload({ waitUntil: 'networkidle0' })
await sleep(700)
await page.click('.fab')

const chain = () =>
  page.evaluate(() => {
    const input = document.querySelector('.big-number-value')
    const out = []
    let node = input
    while (node && node !== document.documentElement) {
      const s = getComputedStyle(node)
      out.push({
        tag: node.tagName,
        cls: String(node.className).slice(0, 40),
        visibility: s.visibility,
        opacity: s.opacity,
        transform: s.transform,
        transition: s.transitionProperty + ' ' + s.transitionDuration + ' ' + s.transitionDelay,
        anim: s.animationName + ' ' + s.animationDuration + ' ' + s.animationDelay,
      })
      node = node.parentElement
    }
    return out
  })

let elapsed = 0
for (const t of [50, 150, 300, 500, 800, 1200]) {
  await sleep(t - elapsed)
  elapsed = t
  const data = await chain()
  console.log(`\n=== at ${t}ms ===`)
  console.log(JSON.stringify(data.slice(0, 8), null, 1))
}

await page.screenshot({ path: 'qa/regression/shots/_debug-sheet-late.png' })
await page.evaluate(() => document.querySelector('.fab'))
// Force reload to test immediate screenshot
await page.reload({ waitUntil: 'networkidle0' })
await sleep(500)
await page.click('.fab')
await sleep(350)
await page.screenshot({ path: 'qa/regression/shots/_debug-sheet-350.png' })
const at350 = await page.evaluate(() => {
  const input = document.querySelector('.big-number-value')
  return {
    visibility: getComputedStyle(input).visibility,
    rect: input.getBoundingClientRect().toJSON(),
    hit: (() => {
      const r = input.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return el ? `${el.tagName}.${el.className}` : null
    })(),
    sheetLayer: (() => {
      const layer = document.querySelector('.sheet-layer')
      return { cls: layer.className, visibility: getComputedStyle(layer).visibility }
    })(),
  }
})
console.log('\nAT 350 AFTER REOPEN', JSON.stringify(at350, null, 2))
await browser.close()

