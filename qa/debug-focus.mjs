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
await page.evaluateOnNewDocument((v) => {
  try {
    localStorage.setItem('weight-tracker:v1', v)
  } catch {}
}, JSON.stringify(seed))
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await page.reload({ waitUntil: 'networkidle0' })
await sleep(700)

const snap = (label) =>
  page.evaluate((label) => {
    const input = document.querySelector('.big-number-value')
    const ir = input?.getBoundingClientRect()
    const panel = document.querySelector('.sheet-panel')
    const pr = panel?.getBoundingClientRect()
    const cx = ir ? ir.left + ir.width / 2 : 0
    const cy = ir ? ir.top + ir.height / 2 : 0
    const hit = ir ? document.elementFromPoint(cx, cy) : null
    return {
      label,
      active: {
        tag: document.activeElement?.tagName,
        cls: document.activeElement?.className,
        label: document.activeElement?.getAttribute('aria-label'),
      },
      inputRect: ir ? { left: ir.left, top: ir.top, width: ir.width, height: ir.height, right: ir.right, bottom: ir.bottom } : null,
      panelRect: pr ? { left: pr.left, top: pr.top, width: pr.width, height: pr.height } : null,
      hit: hit ? { tag: hit.tagName, cls: hit.className, text: hit.textContent?.slice(0, 30) } : null,
      inputStyle: input
        ? {
            pointerEvents: getComputedStyle(input).pointerEvents,
            display: getComputedStyle(input).display,
            visibility: getComputedStyle(input).visibility,
            opacity: getComputedStyle(input).opacity,
            zIndex: getComputedStyle(input).zIndex,
          }
        : null,
      value: input?.value,
      selection: [input?.selectionStart, input?.selectionEnd],
      valueAtPoint: (() => {
        const hitInput = hit?.closest?.('.big-number-value')
        return Boolean(hitInput)
      })(),
    }
  }, label)

console.log('BEFORE OPEN', JSON.stringify(await snap('before'), null, 2))
await page.click('.fab')
await sleep(50)
console.log('50ms', JSON.stringify(await snap('50'), null, 2))
await sleep(200)
console.log('250ms', JSON.stringify(await snap('250'), null, 2))
await sleep(200)
console.log('450ms', JSON.stringify(await snap('450'), null, 2))

// Attempt a click and immediately inspect.
const box = await page.$eval('.big-number-value', (el) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
console.log('CLICK BOX', box)
await page.mouse.click(box.x, box.y)
await sleep(30)
console.log('after mouse.click 30ms', JSON.stringify(await snap('click30'), null, 2))
await sleep(200)
console.log('after mouse.click 230ms', JSON.stringify(await snap('click230'), null, 2))

// Now try a second click at the same point.
await page.mouse.click(box.x, box.y)
await sleep(100)
console.log('after 2nd click', JSON.stringify(await snap('click2'), null, 2))

// Focus programmatically and check selection behavior.
await page.evaluate(() => document.querySelector('.big-number-value').focus())
await sleep(150)
console.log('after .focus()', JSON.stringify(await snap('focus'), null, 2))
await page.keyboard.type('0.5')
console.log('after typing', JSON.stringify(await snap('typed'), null, 2))

await browser.close()
