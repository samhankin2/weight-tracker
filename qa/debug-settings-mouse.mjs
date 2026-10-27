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

const state = () =>
  page.evaluate(() => ({
    active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
    values: [...document.querySelectorAll('.view--settings input')].map((i) => `${i.getAttribute('aria-label')}=${i.value}`),
  }))

// Realistic mouse: edit start, immediately click goal, type.
await page.click('input[aria-label="Starting weight in kilograms"]')
await page.keyboard.down('Control')
await page.keyboard.press('KeyA')
await page.keyboard.up('Control')
await page.keyboard.type('81')
await page.click('input[aria-label="Goal weight in kilograms"]')
await sleep(400)
console.log('AFTER EDIT START -> CLICK GOAL', JSON.stringify(await state(), null, 2))
await page.keyboard.type('74')
await sleep(200)
console.log('AFTER TYPE INTO GOAL (if focused)', JSON.stringify(await state(), null, 2))

// Add a `data-focus-key` sanity check: change range then focus stays.
await page.click('.tab-button[data-tab="dashboard"]')
await sleep(500)
await page.evaluate(() => document.querySelector('.segmented-option[aria-checked="true"]').focus())
await page.keyboard.press('ArrowRight')
await sleep(400)
console.log('SEGMENTED AFTER ARROW', JSON.stringify(await page.evaluate(() => ({ active: document.activeElement?.className, text: document.activeElement?.textContent })), null, 2))

await browser.close()
