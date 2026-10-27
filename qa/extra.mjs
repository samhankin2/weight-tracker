import puppeteer from 'puppeteer'
import fs from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = 'qa/screenshots'
const results = []
const check = (id, name, ok, details) => { results.push({ id, name, ok: !!ok, details }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name} :: ${JSON.stringify(details).slice(0, 700)}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const daysAgo = (n) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))

// 60 entries ending 3 days ago, drifting 82 -> 73 (goal 75 is passed)
const entries = []
for (let i = 0; i < 60; i++) {
  const dAgo = 3 + (59 - i)
  const weight = Math.round((82 - (9 * i) / 59) * 10) / 10
  entries.push({ date: daysAgo(dAgo), weightKg: weight, createdAt: Date.now() - i * 1000, updatedAt: Date.now() - i * 1000 })
}
const phases = [{ id: 'p1', name: 'Cut', startDate: daysAgo(50), endDate: null, color: '#3b82f6', createdAt: Date.now() }]
const profile = { startWeightKg: 82, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 }
const seed = JSON.stringify({ entries, phases, profile, version: 1 })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}\n${e.stack}`))
await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await page.evaluateOnNewDocument((s) => localStorage.setItem('weight-tracker:v1', s), seed)
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await sleep(900)

const loaded = await page.evaluate(() => ({ headline: document.querySelector('.headline-number')?.textContent, entries: document.querySelectorAll('.entry-row').length }))
check('Y0', 'Seeded state loads (60 entries)', loaded.entries > 0, loaded)

// ---- Goal card with an overshot goal
const goal = await page.evaluate(() => ({
  goalCard: document.querySelector('[aria-label="Goal progress"]')?.innerText,
  progressNow: document.querySelector('.progress-track')?.getAttribute('aria-valuenow'),
  headline: document.querySelector('.headline-number')?.textContent,
  chartFrame: (() => { const f = document.querySelector('.chart-frame'); const r = f?.getBoundingClientRect(); return { children: f?.childElementCount, h: r?.height, hidden: f?.classList.contains('is-hidden') } })(),
}))
check('Y1', 'Goal progress card renders', !!goal.goalCard, goal)
await page.screenshot({ path: `${OUT}/20-dashboard-data-360-light.png`, fullPage: true })

// ---- Long history -> bottom -> switch tab
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'history')?.click())
await sleep(500)
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await sleep(400)
const histBottom = await page.evaluate(() => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight, footer: document.querySelector('.view-footer-note')?.textContent }))
await page.screenshot({ path: `${OUT}/21-history-long-bottom-360-light.png` })
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'settings')?.click())
await sleep(600)
const afterTab = await page.evaluate(() => {
  const h1 = document.querySelector('.view-title')
  const r = h1?.getBoundingClientRect()
  return { y: scrollY, h1Text: h1?.textContent, h1Top: r?.top, h1Visible: !!r && r.top >= 0 && r.bottom <= innerHeight, firstCardTop: document.querySelector('.card')?.getBoundingClientRect().top, max: document.documentElement.scrollHeight - innerHeight }
})
check('Y2', 'After scrolling a long History list, switching to Settings shows its header', afterTab.h1Visible, { histBottom, afterTab })
await page.screenshot({ path: `${OUT}/22-settings-after-tab-switch-360-light.png` })

// ---- History footer date formatting with a past last entry
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'history')?.click())
await sleep(400)
const footer = await page.evaluate(() => ({ footer: document.querySelector('.view-footer-note')?.textContent, months: [...document.querySelectorAll('.history-month')].map((e) => e.textContent), rows: document.querySelectorAll('.entry-row--detailed').length }))
check('Y3', 'History footer formats the last-entry date for humans', !!footer.footer && !/\d{4}-\d{2}-\d{2}/.test(footer.footer), footer)
await page.screenshot({ path: `${OUT}/25-history-360-light.png`, fullPage: true })

// ---- Focus trap + Escape with real key presses
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'dashboard')?.click())
await sleep(600)
await page.click('.fab'); await sleep(500)
const focusBefore = await page.evaluate(() => ({ cls: document.activeElement.className, inPanel: document.querySelector('.sheet-panel').contains(document.activeElement) }))
const focusSeq = []
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab')
  focusSeq.push(await page.evaluate(() => {
    const a = document.activeElement
    const panel = document.querySelector('.sheet-panel')
    return `${a.tagName}.${String(a.className).slice(0, 20)}${panel?.contains(a) ? '[in]' : '[OUT]'}`
  }))
}
check('Y4', 'Focus moves into the dialog on open', focusBefore.inPanel, focusBefore)
check('Y5', 'Focus is trapped inside the modal when tabbing', focusSeq.every((f) => f.includes('[in]')), focusSeq)
check('Y6', 'Escape closes the sheet when focus was left on the FAB (as the app does)', await (async () => {
  await page.evaluate(() => document.querySelector('.fab').focus())
  await page.keyboard.press('Escape')
  await sleep(350)
  return !(await page.evaluate(() => !!document.querySelector('.sheet-layer:not([hidden])')))
})(), {})
await page.evaluate(() => document.querySelector('.sheet-layer:not([hidden])')?.remove())

// ---- Tablet layout
await page.setViewport({ width: 768, height: 1024, isMobile: false, hasTouch: true, deviceScaleFactor: 1 })
await page.reload({ waitUntil: 'networkidle0' })
await sleep(900)
const tablet = await page.evaluate(() => {
  const shell = document.querySelector('.app-shell').getBoundingClientRect()
  const tab = document.querySelector('.tab-bar').getBoundingClientRect()
  const fab = document.querySelector('.fab').getBoundingClientRect()
  return { shell: { l: shell.left, r: shell.right, w: shell.width }, tab: { l: tab.left, r: tab.right, w: tab.width }, fab: { l: fab.left, r: fab.right, t: fab.top }, sw: document.documentElement.scrollWidth, iw: innerWidth }
})
check('Y7', 'Tablet: FAB stays inside the centered content column', tablet.fab.l < tablet.shell.r, tablet)
check('Y8', 'Tablet: tab bar is centered under the content column', Math.abs(tablet.tab.w - tablet.shell.w) < 2 || Math.abs((tablet.tab.l + tablet.tab.r) / 2 - 384) < 2, tablet)
await page.screenshot({ path: `${OUT}/23-dashboard-768-light.png`, fullPage: true })

// ---- 320px with data
await page.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await page.reload({ waitUntil: 'networkidle0' })
await sleep(900)
const s320 = await page.evaluate(() => {
  const seg = document.querySelector('.segmented-control')
  const opts = [...document.querySelectorAll('.segmented-option')]
  const last = opts[opts.length - 1].getBoundingClientRect()
  const card = document.querySelector('.chart-card').getBoundingClientRect()
  return { seg: { l: seg.getBoundingClientRect().left, w: seg.getBoundingClientRect().width }, segScrollW: seg.scrollWidth, segClientW: seg.clientWidth, last: { l: last.left, r: last.right }, card: { l: card.left, r: card.right }, sw: document.documentElement.scrollWidth, iw: innerWidth }
})
check('Y9', '320px: all chart-range options fit without horizontal scrolling', s320.segScrollW <= s320.segClientW + 1, s320)
await page.screenshot({ path: `${OUT}/24-dashboard-320-light.png`, fullPage: true })

// dark mode screenshots with data
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
await page.reload({ waitUntil: 'networkidle0' })
await sleep(900)
await page.screenshot({ path: `${OUT}/26-dashboard-data-360-dark.png`, fullPage: true })
await page.click('.fab'); await sleep(500)
await page.screenshot({ path: `${OUT}/27-log-sheet-360-dark.png` })
await page.keyboard.press('Escape'); await sleep(300)
await page.evaluate(() => document.querySelector('.sheet-layer:not([hidden])')?.remove())
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'history')?.click())
await sleep(500)
await page.screenshot({ path: `${OUT}/28-history-360-dark.png`, fullPage: true })
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'settings')?.click())
await sleep(500)
await page.screenshot({ path: `${OUT}/29-settings-360-dark.png`, fullPage: true })

fs.writeFileSync('qa/extra-results.json', JSON.stringify({ results, logs }, null, 2))
console.log('\nFAILS:', results.filter((r) => !r.ok).map((r) => r.id + ' ' + r.name).join('\n'))
console.log('LOGS:', logs.filter((l) => !l.includes('[debug]')).join('\n'))
await browser.close()
