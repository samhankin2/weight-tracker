import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = new Date()
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
let stamp = Date.now()
const seed = {
  entries: Array.from({ length: 40 }, (_, i) => ({
    date: daysAgo(39 - i),
    weightKg: Math.round((82 - i * 0.2) * 10) / 10,
    createdAt: stamp++,
    updatedAt: stamp++,
  })),
  phases: [],
  profile: { startWeightKg: 80, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
  version: 1,
}
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const rows = []
for (let i = 0; i < 12; i++) {
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
  await sleep(300)
  const before = await page.evaluate(() => {
    const input = document.querySelector('.big-number-value')
    const r = input.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return {
      visibility: getComputedStyle(input).visibility,
      logSheet: getComputedStyle(document.querySelector('.log-sheet')).visibility,
      hit: hit ? `${hit.tagName}.${String(hit.className).slice(0, 30)}` : null,
      active: document.activeElement?.className || document.activeElement?.tagName,
    }
  })
  // Tap the number once.
  await page.click('.big-number-value').catch((e) => {
    before.clickError = String(e).slice(0, 150)
  })
  await sleep(200)
  const after = await page.evaluate(() => ({
    active: document.activeElement?.className || document.activeElement?.tagName,
    value: document.querySelector('.big-number-value')?.value,
    selection: [document.querySelector('.big-number-value')?.selectionStart, document.querySelector('.big-number-value')?.selectionEnd],
  }))
  await page.keyboard.type('0.5', { delay: 20 })
  const typed = await page.evaluate(() => document.querySelector('.big-number-value')?.value)
  rows.push({ i, before, after, typed })
  if (before.visibility === 'hidden') {
    await page.screenshot({ path: `qa/regression/shots/_hidden-${i}.png` })
  }
  await context.close()
}
await browser.close()
console.log(JSON.stringify(rows, null, 2))
console.log('hiddenCount', rows.filter((r) => r.before.visibility === 'hidden').length, '/', rows.length)
console.log('tapFailedCount', rows.filter((r) => r.after.active !== 'big-number-value').length, '/', rows.length)
console.log('typeFailedCount', rows.filter((r) => r.typed !== '0.5').length, '/', rows.length)
