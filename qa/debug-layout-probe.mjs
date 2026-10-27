import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = new Date()
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
let stamp = Date.now()
const entries = Array.from({ length: 30 }, (_, i) => ({
  date: daysAgo(30 - i),
  weightKg: Math.round((82 - i * 0.24) * 10) / 10,
  createdAt: stamp++,
  updatedAt: stamp++,
}))
const seed = {
  entries,
  phases: [{ id: 'p', name: 'Bulk', startDate: daysAgo(14), endDate: null, color: '#f59e0b', createdAt: stamp++ }],
  profile: { startWeightKg: 82, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
  version: 1,
}
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const intersect = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
for (const [w, h] of [[360, 740], [320, 568], [768, 1024]]) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width: w, height: h, isMobile: w < 520, hasTouch: true, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  await page.evaluateOnNewDocument((v) => { try { localStorage.setItem('weight-tracker:v1', v) } catch {} }, JSON.stringify(seed))
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(900)
  const dash = await page.evaluate(() => {
    const r = (el) => el?.getBoundingClientRect().toJSON()
    const fab = r(document.querySelector('.fab'))
    const goal = document.querySelector('[aria-label="Goal progress"]')
    const figure = goal?.querySelector('.goal-figure')
    const detail = goal?.querySelector('.goal-detail')
    const grid = document.querySelector('.stat-grid')
    const tiles = [...document.querySelectorAll('.stat-tile')].map((t) => {
      const unit = t.querySelector('.stat-unit')
      const value = t.querySelector('.stat-value')
      const vr = value?.getBoundingClientRect()
      const ur = unit?.getBoundingClientRect()
      return {
        label: t.querySelector('.stat-label')?.textContent?.trim(),
        value: value?.textContent,
        unit: unit?.textContent,
        valueRect: vr ? { top: vr.top, bottom: vr.bottom, left: vr.left, right: vr.right } : null,
        unitRect: ur ? { top: ur.top, bottom: ur.bottom, left: ur.left, right: ur.right } : null,
        inline: Boolean(vr && ur && Math.abs(vr.top - ur.top) < 8),
      }
    })
    return {
      fab,
      goal: {
        rect: r(goal),
        figure: figure?.textContent,
        figureRect: r(figure),
        detail: detail?.textContent,
        detailRect: r(detail),
        detailScrollWidth: detail?.scrollWidth,
        detailClientWidth: detail?.clientWidth,
        gap: figure && detail ? r(detail).left - r(figure).right : null,
        fabOverlaps: fab && goal ? (() => { const g = r(goal); return fab.left < g.right && fab.right > g.left && fab.top < g.bottom && fab.bottom > g.top })() : null,
      },
      grid: r(grid),
      tiles,
    }
  })
  await page.click('.tab-button[data-tab="settings"]')
  await sleep(500)
  const settings = await page.evaluate(() => {
    const r = (el) => el?.getBoundingClientRect().toJSON()
    const fab = r(document.querySelector('.fab'))
    const manage = [...document.querySelectorAll('.view--settings button')].find((b) => b.textContent.includes('Manage phases'))
    const mr = r(manage)
    const tab = r(document.querySelector('.tab-bar'))
    return {
      fab,
      manage: { rect: mr, text: manage?.textContent.trim() },
      tab,
      fabOverlapsManage: fab && mr ? fab.left < mr.right && fab.right > mr.left && fab.top < mr.bottom && fab.bottom > mr.top : null,
      overlapArea:
        fab && mr
          ? Math.max(0, Math.min(fab.right, mr.right) - Math.max(fab.left, mr.left)) *
            Math.max(0, Math.min(fab.bottom, mr.bottom) - Math.max(fab.top, mr.top))
          : null,
      manageNearTab: mr && tab ? mr.bottom > tab.top : null,
    }
  })
  console.log(JSON.stringify({ viewport: `${w}x${h}`, dash, settings }, null, 2))
  await context.close()
}
await browser.close()
