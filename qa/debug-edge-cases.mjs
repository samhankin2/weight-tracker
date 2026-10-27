import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = new Date()
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
const TODAY = daysAgo(0)
const YESTERDAY = daysAgo(1)
const TWO = daysAgo(2)
let stamp = Date.now()
const entry = (date, weightKg) => ({ date, weightKg, createdAt: stamp++, updatedAt: stamp++ })
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })

async function pageWith(seed, width = 360, height = 740) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width, height, isMobile: width < 520, hasTouch: true, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  await page.evaluateOnNewDocument((v) => { try { localStorage.setItem('weight-tracker:v1', v) } catch {} }, JSON.stringify(seed))
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(700)
  return { context, page }
}
const baseProfile = { startWeightKg: 82, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 }

// Move to a FREE date => 2 entries.
{
  const { context, page } = await pageWith({
    entries: [entry(YESTERDAY, 75.1), entry(TODAY, 74.5)],
    phases: [],
    profile: baseProfile,
    version: 1,
  })
  await page.click('[aria-label="Recent entries"] .entry-row .entry-main')
  await sleep(450)
  await page.evaluate((value) => {
    const input = document.querySelector('input[aria-label="Date of weigh-in"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, TWO)
  await sleep(150)
  await page.click('.sheet-actions .button--primary')
  await sleep(500)
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}'))
  console.log('MOVE TO FREE DATE', JSON.stringify({ count: state.entries?.length, entries: state.entries }, null, 2))
  await context.close()
}

// Goal card with the exact item-7 scenario at 320 and 360, plus a not-reached cut.
for (const [label, weight, width] of [
  ['past-goal-360', 73, 360],
  ['past-goal-320', 73, 320],
  ['cut-to-go-360', 77, 360],
]) {
  const { context, page } = await pageWith(
    { entries: [entry(TODAY, weight)], phases: [], profile: baseProfile, version: 1 },
    width,
    740,
  )
  const goal = await page.evaluate(() => {
    const card = document.querySelector('[aria-label="Goal progress"]')
    const figure = card.querySelector('.goal-figure')
    const detail = card.querySelector('.goal-detail')
    const fr = figure.getBoundingClientRect()
    const dr = detail.getBoundingClientRect()
    const cr = card.getBoundingClientRect()
    return {
      figure: figure.textContent,
      detail: detail.textContent,
      detailRect: { left: dr.left, right: dr.right, top: dr.top, bottom: dr.bottom, height: dr.height },
      figureRect: { left: fr.left, right: fr.right, top: fr.top, bottom: fr.bottom },
      cardRect: { left: cr.left, right: cr.right, bottom: cr.bottom, height: cr.height },
      detailScrollWidth: detail.scrollWidth,
      detailClientWidth: detail.clientWidth,
      gap: dr.left - fr.right,
      overlapsFigure: dr.left < fr.right && dr.right > fr.left && dr.top < fr.bottom && dr.bottom > fr.top,
      overflowRight: dr.right > cr.right + 1,
      lineCount: Math.round(dr.height / parseFloat(getComputedStyle(detail).lineHeight)),
    }
  })
  console.log(label, JSON.stringify(goal, null, 2))
  await page.screenshot({ path: `qa/regression/shots/goal-${label}.png`, fullPage: false })
  await context.close()
}
await browser.close()
