import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = new Date()
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
let stamp = Date.now()
const entry = (date, weightKg) => ({ date, weightKg, createdAt: stamp++, updatedAt: stamp++ })
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })

async function open(seed, width, height, theme = 'light') {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width, height, isMobile: width < 520, hasTouch: true, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  await page.evaluateOnNewDocument((v) => { try { localStorage.setItem('weight-tracker:v1', v) } catch {} }, JSON.stringify(seed))
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(800)
  return { context, page }
}

// 1) Long but plausible values: 182.5 kg, big changes, long streak.
{
  const entries = Array.from({ length: 40 }, (_, i) => entry(daysAgo(39 - i), Math.round((145 + i * 0.95) * 10) / 10))
  const seed = {
    entries,
    phases: [],
    profile: { startWeightKg: 145, goalWeightKg: 190, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
    version: 1,
  }
  for (const [w, h] of [[320, 568], [360, 740], [768, 1024]]) {
    const { context, page } = await open(seed, w, h)
    const data = await page.evaluate(() => {
      const info = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return {
          text: el.textContent,
          rect: { left: r.left, right: r.right, width: r.width, height: r.height },
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          overflow: cs.overflow,
          textOverflow: cs.textOverflow,
          clipped: el.scrollWidth > el.clientWidth + 1,
        }
      }
      const tiles = [...document.querySelectorAll('.stat-tile')].map((t) => ({
        label: t.querySelector('.stat-label')?.textContent?.trim(),
        value: t.querySelector('.stat-value')?.textContent,
        valueClipped: (() => {
          const v = t.querySelector('.stat-value')
          return v ? v.scrollWidth > v.clientWidth + 1 : false
        })(),
        unit: t.querySelector('.stat-unit')?.textContent,
        unitClipped: (() => {
          const u = t.querySelector('.stat-unit')
          return u ? u.scrollWidth > u.clientWidth + 1 : false
        })(),
        tileOverflow: t.scrollWidth > t.clientWidth + 1,
        valueRect: (() => {
          const v = t.querySelector('.stat-value')?.getBoundingClientRect()
          const tr = t.getBoundingClientRect()
          return v ? { right: v.right, tileRight: tr.right } : null
        })(),
      }))
      return { tiles, headline: info('.headline-number'), headlineRow: info('.headline-main') }
    })
    const bad = data.tiles.filter((t) => t.valueClipped || t.unitClipped || t.tileOverflow)
    console.log(`LONG VALUES ${w}x${h}`, JSON.stringify({ bad, tiles: data.tiles, headline: data.headline, headlineRow: data.headlineRow }, null, 2))
    await page.screenshot({ path: `qa/regression/shots/long-values-${w}.png` })
    await context.close()
  }
}

// 2) Phase band pixel colour (light) in a band-only region (above the data line).
{
  const entries = Array.from({ length: 30 }, (_, i) => entry(daysAgo(29 - i), 80))
  const seed = {
    entries,
    phases: [{ id: 'p', name: 'Bulk', startDate: daysAgo(14), endDate: null, color: '#f59e0b', createdAt: stamp++ }],
    profile: { startWeightKg: 80, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
    version: 1,
  }
  for (const theme of ['light', 'dark']) {
    const { context, page } = await open(seed, 360, 740, theme)
    const samples = await page.evaluate(() => {
      const c = document.querySelector('canvas')
      const ctx = c.getContext('2d')
      const pts = []
      for (const [fx, fy] of [[0.9, 0.1], [0.9, 0.2], [0.95, 0.5], [0.7, 0.5], [0.2, 0.5]]) {
        const x = Math.round(c.width * fx)
        const y = Math.round(c.height * fy)
        pts.push({ fx, fy, rgba: Array.from(ctx.getImageData(x, y, 1, 1).data) })
      }
      return pts
    })
    console.log('PHASE PIXELS', theme, JSON.stringify(samples))
    await page.screenshot({ path: `qa/regression/shots/phase-flat-360-${theme}.png` })
    await context.close()
  }
}
await browser.close()
