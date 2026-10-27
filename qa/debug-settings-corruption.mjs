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

const snap = async (label) => {
  const data = await page.evaluate(() => ({
    active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
    inputs: [...document.querySelectorAll('.view--settings input')].slice(0, 3).map((i) => ({
      label: i.getAttribute('aria-label'),
      value: i.value,
    })),
    stored: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile,
  }))
  console.log(label, JSON.stringify(data, null, 2))
}
await snap('START')

async function editAndMove(label, aria, text, nextAria) {
  await page.click(`input[aria-label="${aria}"]`)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.type(text)
  await page.click(`input[aria-label="${nextAria}"]`)
  await sleep(500)
  console.log(`AFTER "${text}" -> click ${nextAria}`)
  await snap(' state')
  await page.keyboard.type('999')
  await sleep(250)
  console.log('  after typing 999 (where did it land?)')
  await snap('  state')
}

await editAndMove('start', 'Starting weight in kilograms', '82', 'Goal weight in kilograms')
// Now recover by resetting fields via keyboard? Just observe final state.
await sleep(300)
await page.screenshot({ path: 'qa/regression/shots/settings-focus-corruption.png' })
console.log('FINAL')
await snap('FINAL')
await browser.close()
