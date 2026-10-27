import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let stamp = Date.now()
const seed = {
  entries: [{ date: '2026-10-26', weightKg: 75.3, createdAt: stamp++, updatedAt: stamp++ }],
  phases: [],
  profile: { startWeightKg: 80, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
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
const edit = async (aria, text) => {
  await page.click(`input[aria-label="${aria}"]`)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.type(text)
}
const centers = await page.evaluate(() => {
  const map = {}
  for (const label of ['Starting weight in kilograms', 'Goal weight in kilograms', 'Height in centimetres']) {
    const r = document.querySelector(`input[aria-label="${label}"]`).getBoundingClientRect()
    map[label] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  map.title = { x: 100, y: 100 }
  return map
})
await edit('Starting weight in kilograms', '82')
await page.mouse.click(centers['Goal weight in kilograms'].x, centers['Goal weight in kilograms'].y)
await sleep(600)
await page.keyboard.type('75')
await page.mouse.click(centers['Height in centimetres'].x, centers['Height in centimetres'].y)
await sleep(600)
await page.keyboard.type('180')
await page.mouse.click(centers.title.x, centers.title.y)
await sleep(700)
const result = await page.evaluate(() => ({
  values: [...document.querySelectorAll('.view--settings input')].slice(0, 3).map((i) => ({
    label: i.getAttribute('aria-label'),
    value: i.value,
  })),
  stored: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile,
  active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
}))
console.log(JSON.stringify(result, null, 2))
await page.screenshot({ path: 'qa/regression/shots/settings-real-flow-corruption.png' })
await browser.close()

