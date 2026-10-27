import puppeteer from 'puppeteer'
import fs from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const out = []
const say = (id, d) => { out.push({ id, d }); console.log(id, JSON.stringify(d)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const daysAgo = (n) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))

const entries = []
for (let i = 0; i < 40; i++) entries.push({ date: daysAgo(39 - i), weightKg: Math.round((82 - i * 0.2) * 10) / 10, createdAt: Date.now(), updatedAt: Date.now() })
const seed = JSON.stringify({ entries, phases: [{ id: 'p1', name: 'Cut', startDate: daysAgo(20), endDate: null, color: '#3b82f6', createdAt: Date.now() }], profile: { startWeightKg: 82, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 }, version: 1 })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.evaluateOnNewDocument((s) => localStorage.setItem('weight-tracker:v1', s), seed)

for (const [w, h] of [[360, 740], [390, 844], [320, 568], [768, 1024]]) {
  await page.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: true, deviceScaleFactor: 2 })
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
  await sleep(800)
  const stat = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.stat-tile')]
    return tiles.map((t) => {
      const tr = t.getBoundingClientRect()
      const row = t.querySelector('.stat-value-row').getBoundingClientRect()
      const val = t.querySelector('.stat-value')
      const unit = t.querySelector('.stat-unit')
      const vr = val.getBoundingClientRect()
      const ur = unit ? unit.getBoundingClientRect() : null
      return {
        label: t.querySelector('.stat-label').textContent,
        tile: { l: +tr.left.toFixed(1), r: +tr.right.toFixed(1), w: +tr.width.toFixed(1) },
        overflowHiddenClips: t.scrollWidth > t.clientWidth + 1,
        row: { l: +row.left.toFixed(1), r: +row.right.toFixed(1), w: +row.width.toFixed(1) },
        value: { text: val.textContent, l: +vr.left.toFixed(1), r: +vr.right.toFixed(1), w: +vr.width.toFixed(1) },
        unit: ur ? { text: unit.textContent, l: +ur.left.toFixed(1), r: +ur.right.toFixed(1) } : null,
        unitEscapesTile: ur ? ur.right > tr.right + 0.5 : null,
        rowEscapesTile: row.right > tr.right + 0.5,
      }
    })
  })
  const seg = await page.evaluate(() => {
    const s = document.querySelector('.segmented-control')
    const sr = s.getBoundingClientRect()
    const opts = [...document.querySelectorAll('.segmented-option')].map((o) => { const r = o.getBoundingClientRect(); return { t: o.textContent, l: +r.left.toFixed(1), r: +r.right.toFixed(1) } })
    return { seg: { l: +sr.left.toFixed(1), r: +sr.right.toFixed(1), w: +sr.width.toFixed(1) }, scrollW: s.scrollWidth, clientW: s.clientWidth, clipped: s.scrollWidth > s.clientWidth + 1, opts, viewport: innerWidth }
  })
  const fab = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
    const f = document.querySelector('.fab').getBoundingClientRect()
    const rows = [...document.querySelectorAll('.entry-main, .stat-tile, .progress-track')].map((r) => { const b = r.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right } })
    const hits = rows.filter((r) => !(r.r < f.left || r.l > f.right || r.b < f.top || r.t > f.bottom))
    return { fab: { t: +f.top.toFixed(1), b: +f.bottom.toFixed(1), l: +f.left.toFixed(1), r: +f.right.toFixed(1) }, maxScroll: document.documentElement.scrollHeight - innerHeight, y: scrollY, overlapsAtMaxScroll: hits.length }
  })
  say(`viewport ${w}x${h}`, { stat, seg, fab })

  // sheet content clipping
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.click('.fab')
  await sleep(500)
  const sheet = await page.evaluate(() => {
    const content = document.querySelector('.sheet-content')
    const cr = content.getBoundingClientRect()
    const note = document.querySelector('input[aria-label="Note"]').getBoundingClientRect()
    const noteLabel = [...document.querySelectorAll('.sheet-content .field-label')].pop().getBoundingClientRect()
    const actions = document.querySelector('.sheet-actions').getBoundingClientRect()
    const dateInput = document.querySelector('input[type=date]').getBoundingClientRect()
    return {
      content: { t: +cr.top.toFixed(1), b: +cr.bottom.toFixed(1), h: +cr.height.toFixed(1), scrollH: content.scrollHeight, clientH: content.clientHeight, scrollable: content.scrollHeight - content.clientHeight },
      note: { t: +note.top.toFixed(1), b: +note.bottom.toFixed(1), fullyVisible: note.top >= cr.top && note.bottom <= cr.bottom },
      noteFieldLabelTop: +noteLabel.top.toFixed(1),
      actionsTop: +actions.top.toFixed(1),
      dateInput: { t: +dateInput.top.toFixed(1), b: +dateInput.bottom.toFixed(1) },
      contentBottomVsActionsTop: +(actions.top - cr.bottom).toFixed(1),
    }
  })
  say(`sheet ${w}x${h}`, sheet)
  await page.screenshot({ path: `qa/screenshots/30-sheet-${w}.png` })
  await page.keyboard.press('Escape')
  await sleep(200)
  await page.evaluate(() => document.querySelector('.sheet-layer:not([hidden])')?.remove())
  await page.evaluate(() => document.activeElement?.blur())
}

// toast vs FAB for a long message
await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await sleep(700)
await page.click('.fab'); await sleep(400)
await page.click('.big-number-value')
await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
await page.keyboard.type('999')
await page.click('.sheet-actions .button--primary')
await sleep(300)
const toast = await page.evaluate(() => {
  const t = document.querySelector('.toast').getBoundingClientRect()
  const f = document.querySelector('.fab').getBoundingClientRect()
  const overlap = !(t.right < f.left || t.left > f.right || t.bottom < f.top || t.top > f.bottom)
  return { text: document.querySelector('.toast').innerText, toast: { t: +t.top.toFixed(1), b: +t.bottom.toFixed(1), l: +t.left.toFixed(1), r: +t.right.toFixed(1) }, fab: { t: +f.top.toFixed(1), b: +f.bottom.toFixed(1), l: +f.left.toFixed(1), r: +f.right.toFixed(1) }, overlap }
})
say('toast-vs-fab', toast)
await page.screenshot({ path: 'qa/screenshots/31-toast-error-360.png' })

fs.writeFileSync('qa/measure-results.json', JSON.stringify(out, null, 2))
await browser.close()
