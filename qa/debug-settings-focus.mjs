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

const active = () =>
  page.evaluate(() => ({
    label: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
    value: document.activeElement?.value,
    inputs: [...document.querySelectorAll('.view--settings input')].map((i) => ({
      label: i.getAttribute('aria-label'),
      value: i.value,
      focused: i === document.activeElement,
    })),
  }))

console.log('INITIAL', JSON.stringify(await active(), null, 2))

// Click start weight, type a value, press Tab (real user flow).
await page.click('input[aria-label="Starting weight in kilograms"]')
await page.keyboard.down('Control')
await page.keyboard.press('KeyA')
await page.keyboard.up('Control')
await page.keyboard.type('81')
await page.keyboard.press('Tab')
await sleep(500)
console.log('AFTER EDIT START + TAB', JSON.stringify(await active(), null, 2))

// Now focus goal weight directly, edit, press Tab.
await page.click('input[aria-label="Goal weight in kilograms"]')
await page.keyboard.down('Control')
await page.keyboard.press('KeyA')
await page.keyboard.up('Control')
await page.keyboard.type('74')
await page.keyboard.press('Tab')
await sleep(500)
console.log('AFTER EDIT GOAL + TAB', JSON.stringify(await active(), null, 2))

// Edit height and blur by clicking elsewhere.
await page.click('input[aria-label="Height in centimetres"]')
await page.keyboard.down('Control')
await page.keyboard.press('KeyA')
await page.keyboard.up('Control')
await page.keyboard.type('181')
await page.click('.view--settings h1')
await sleep(500)
console.log('AFTER EDIT HEIGHT + CLICK TITLE', JSON.stringify(await active(), null, 2))

// Does typing into goal keep focus while the store re-renders? (change only on blur)
await page.click('input[aria-label="Goal weight in kilograms"]')
await page.keyboard.type('9')
await sleep(300)
console.log('WHILE TYPING GOAL', JSON.stringify(await active(), null, 2))

await browser.close()
