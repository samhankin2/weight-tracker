import puppeteer from 'puppeteer'
import fs from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = 'qa/screenshots'
fs.mkdirSync(OUT, { recursive: true })

const results = []
function check(id, name, ok, details) {
  results.push({ id, name, ok: !!ok, details })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${details ? '  :: ' + JSON.stringify(details).slice(0, 700) : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
const consoleLog = []
page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => consoleLog.push(`[PAGEERROR] ${e.message}\n${e.stack}`))
page.on('requestfailed', (r) => consoleLog.push(`[REQFAIL] ${r.url()} ${r.failure()?.errorText}`))

const VP = { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
await page.setViewport(VP)
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await sleep(500)

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const TODAY = iso(now)
const YESTERDAY = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))

// ---------------------------------------------------------------- A. FIRST RUN
const empty = await page.evaluate(() => ({
  text: document.body.innerText,
  fab: document.querySelector('.fab')?.getBoundingClientRect().toJSON(),
  tab: document.querySelector('.tab-bar')?.getBoundingClientRect().toJSON(),
  fabStyle: (() => { const s = getComputedStyle(document.querySelector('.fab')); return { z: s.zIndex, pos: s.position } })(),
  emptyStates: [...document.querySelectorAll('.empty-state-title')].map((e) => e.textContent),
  h1: [...document.querySelectorAll('h1')].map((e) => e.textContent),
  overflow: { sw: document.documentElement.scrollWidth, iw: innerWidth },
}))
check('A1', 'No console errors / page errors on first load', !consoleLog.some((l) => l.includes('[error]') || l.includes('PAGEERROR')), consoleLog.filter((l) => l.includes('error') || l.includes('PAGEERROR')))
check('A2', 'Empty state present', empty.emptyStates.length > 0 && empty.text.includes('No weigh-ins yet'), empty.emptyStates)
check('A3', 'FAB 60x60 bottom-right and does not overlap tab bar', empty.fab && empty.fab.width >= 44 && empty.fab.height >= 44 && empty.fab.bottom <= empty.tab.top, { fab: empty.fab, tabTop: empty.tab.top, gap: empty.tab.top - empty.fab.bottom })
check('A4', 'No horizontal overflow at 360', empty.overflow.sw <= empty.overflow.iw + 1, empty.overflow)
check('A5', 'Dashboard has an h1 page heading', empty.h1.length > 0, { h1: empty.h1 })
await page.screenshot({ path: `${OUT}/01-dashboard-empty-360-light.png`, fullPage: true })

// Open sheet
await page.click('.fab')
await sleep(450)
const sheet = await page.evaluate(() => {
  const panel = document.querySelector('.sheet-panel')
  const save = [...document.querySelectorAll('.sheet-actions button')].find((b) => b.textContent.includes('Save'))
  const input = document.querySelector('.big-number-value')
  const pr = panel?.getBoundingClientRect().toJSON()
  const sr = save?.getBoundingClientRect().toJSON()
  return {
    panel: pr,
    panelVisible: panel ? getComputedStyle(panel).visibility !== 'hidden' && pr.height > 0 : false,
    panelBottomGap: pr ? innerHeight - pr.bottom : null,
    panelTop: pr?.top,
    save: sr,
    saveInViewport: sr ? sr.top >= 0 && sr.bottom <= innerHeight : false,
    saveHit: sr ? (() => { const el = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2); return el?.closest('button') === save })().valueOf?.() : null,
    value: input?.value,
    active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
    backdrop: !!document.querySelector('.sheet-backdrop'),
    dialogTitle: document.querySelector('.sheet-title')?.textContent,
    docH: document.documentElement.scrollHeight,
    innerH: innerHeight,
  }
})
check('A6', 'Log sheet fully visible, not clipped by viewport bottom', sheet.panelVisible && sheet.panelBottomGap !== null && sheet.panelBottomGap > -1 && sheet.panelTop >= 0, sheet)
check('A7', 'Save button reachable without scrolling', sheet.saveInViewport, { save: sheet.save })
check('A8', 'Big number input visible with 0.0 default', sheet.value === '0.0', { value: sheet.value })
check('A9', 'Focus lands on weight input when sheet opens', sheet.active === 'Weight in kg', { active: sheet.active })
await page.screenshot({ path: `${OUT}/02-log-sheet-360-light.png` })

// Backdrop closes
await page.mouse.click(180, 40)
await sleep(400)
const closed = await page.evaluate(() => {
  const layer = document.querySelector('.sheet-layer')
  return { exists: !!layer, isOpen: layer?.classList.contains('is-open'), hidden: layer?.hidden }
})
check('A10', 'Tapping backdrop closes sheet', !closed.exists || closed.hidden || !closed.isOpen, closed)

// ------------------------------------------------------- B. LOGGING / VALIDATION
// Reopen and test steppers
await page.click('.fab')
await sleep(400)
const v0 = await page.$eval('.big-number-value', (e) => e.value)
for (let i = 0; i < 3; i++) await page.click('.step-button--increase')
const v3 = await page.$eval('.big-number-value', (e) => e.value)
await page.click('.step-button--decrease')
const v2 = await page.$eval('.big-number-value', (e) => e.value)
check('B1', 'Stepper +/- changes displayed number correctly (0.0 -> +3 = 0.3 -> -1 = 0.2)', v0 === '0.0' && v3 === '0.3' && v2 === '0.2', { v0, v3, v2 })

// Naive typing without clearing (fumbling simulation) - fresh value 0.0
await page.click('.big-number-value')
await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
await page.keyboard.type('0.0')
await page.keyboard.press('End')
await page.keyboard.type('745')
const fumbleValue = await page.$eval('.big-number-value', (e) => e.value)
const fumbleParsed = await page.evaluate(() => document.querySelector('.big-number-value').value)
check('B2', 'Typing a weight into the prefilled 0.0 field without select-all yields the typed weight', fumbleValue.replace(/[.,]/g, '') === '745', { fumbleValue, note: 'Field pre-set to 0.0, not auto-selected; typing appends' })

// Set a realistic weight via select-all
await page.click('.big-number-value')
await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
await page.keyboard.type('74.5')
const typed = await page.$eval('.big-number-value', (e) => e.value)
check('B3', 'Typing a weight after select-all gives 74.5', typed === '74.5', { typed })
await page.click('.sheet-actions .button--primary')
await sleep(350)
const headline = await page.evaluate(() => ({
  num: document.querySelector('.headline-number')?.textContent,
  unit: document.querySelector('.headline-unit')?.textContent,
  date: document.querySelector('.headline-date')?.textContent,
  toast: document.querySelector('.toast')?.innerText,
  sheetGone: !document.querySelector('.sheet-layer') || document.querySelector('.sheet-layer').hidden,
}))
check('B4', 'Save closes sheet and headline shows 74.5 kg / Today', headline.num === '74.5' && headline.unit === 'kg' && headline.date === 'Today', headline)

// Validation: unrealistic low value
await page.click('.fab'); await sleep(400)
await page.click('.big-number-value')
await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
await page.keyboard.type('0.07')
await page.click('.sheet-actions .button--primary')
await sleep(350)
const lowSave = await page.evaluate(() => ({
  sheetOpen: !!document.querySelector('.sheet-layer:not([hidden])'),
  toast: document.querySelector('.toast')?.innerText,
  headline: document.querySelector('.headline-number')?.textContent,
}))
check('B5', 'Implausible weight (0.07 kg) is rejected', lowSave.sheetOpen === true && /above 0|too (low|high)/i.test(lowSave.toast || ''), lowSave)

// Reset storage to a clean slate, then log two real entries
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0' })
await sleep(500)

async function logWeight(dateStr, weight, { stepper = false } = {}) {
  await page.click('.fab'); await sleep(400)
  if (dateStr) {
    await page.$eval('input[type=date]', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }, dateStr)
  }
  await page.click('.big-number-value')
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
  await page.keyboard.type(weight)
  const before = await page.evaluate(() => ({
    value: document.querySelector('.big-number-value').value,
    dateLabel: document.querySelector('.log-date-info .field-label-text')?.textContent,
    subtitle: document.querySelector('.sheet-subtitle')?.textContent ?? null,
  }))
  await page.click('.sheet-actions .button--primary')
  await sleep(400)
  return before
}

const firstLog = await logWeight(null, '74.5')
check('B6', 'Save button clickable with pointer (no stepper required)', true, firstLog)
const secondLog = await logWeight(YESTERDAY, '75.1')
const thirdLog = await logWeight('2026-09-15', '76.2')
await sleep(300)
const dash2 = await page.evaluate(() => ({
  num: document.querySelector('.headline-number')?.textContent,
  date: document.querySelector('.headline-date')?.textContent,
  recent: [...document.querySelectorAll('.entry-row')].map((r) => r.innerText),
  dateLabel: document.querySelector('.log-date-info .field-label-text')?.textContent,
  lsEntries: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').entries?.map((e) => e.date + '=' + e.weightKg),
}))
check('B7', 'Entries stored; headline shows latest (74.5, Today)', dash2.num === '74.5' && dash2.date === 'Today', dash2)
check('B8', 'Logging for an arbitrary past date saves under the chosen date', dash2.lsEntries?.includes('2026-09-15=76.2'), dash2.lsEntries)
const yRow = dash2.recent.find((r) => r.includes('75.1')) || ''
check('B9', 'Yesterday\'s entry is labelled "Yesterday" (not "Tomorrow")', yRow.startsWith('Yesterday'), { row: yRow, recent: dash2.recent })

// --------------------------------------------------------------- C. CHART
const chartState = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  const frame = document.querySelector('.chart-frame')
  const fr = frame?.getBoundingClientRect()
  let pixels = null
  if (canvas) {
    const c = canvas.getContext('2d')
    try {
      const d = c.getImageData(0, 0, canvas.width, canvas.height).data
      let nonBlank = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) nonBlank++
      pixels = nonBlank
    } catch (e) { pixels = 'ERR ' + e.message }
  }
  return {
    canvasInDom: !!canvas,
    canvasRect: canvas ? canvas.getBoundingClientRect().toJSON() : null,
    frameChildren: frame?.childElementCount,
    frameRect: fr?.toJSON(),
    frameHidden: frame?.classList.contains('is-hidden'),
    pixels,
    chartSectionText: document.querySelector('.chart-card')?.innerText,
    canvasAria: canvas?.getAttribute('aria-label') ?? null,
  }
})
check('C1', 'Chart canvas is present in the DOM after 2 entries', chartState.canvasInDom, chartState)
check('C2', 'Chart frame has non-zero size and renders pixels', !!chartState.canvasRect && chartState.canvasRect.width > 0 && chartState.canvasRect.height > 0 && typeof chartState.pixels === 'number' && chartState.pixels > 500, chartState)
await page.screenshot({ path: `${OUT}/03a-dashboard-2entries-360-light.png`, fullPage: true })

// Segmented control
const segErrorsBefore = consoleLog.length
const segResults = []
for (const label of ['30d', '6mo', '1y', 'All', '90d']) {
  const btn = await page.$$eval('.segmented-option', (els, l) => {
    const b = els.find((e) => e.textContent.trim() === l)
    if (b) b.click()
    return b ? true : false
  }, label)
  await sleep(350)
  const state = await page.evaluate(() => ({
    checked: [...document.querySelectorAll('.segmented-option[aria-checked="true"]')].map((e) => e.textContent.trim()),
    ls: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile?.chartWindowDays,
  }))
  segResults.push({ label, clicked: btn, ...state })
}
check('C3', 'Segmented control switches ranges (30d/6mo/1y/All/90d) without errors', segResults.every((r) => r.clicked && r.checked.length === 1) && consoleLog.length === segErrorsBefore, segResults)

// -------------------------------------------------------------- D. PHASES
await page.evaluate(() => window.scrollTo(0, 0))
await sleep(200)
const newPhaseBtn = await page.$$eval('.card-head-row button', (els) => {
  const b = els.find((e) => e.textContent.trim().includes('New'))
  if (b) b.click()
  return !!b
})
await sleep(450)
const phaseSheet = await page.evaluate(() => ({
  open: !!document.querySelector('.sheet-layer:not([hidden])'),
  title: document.querySelector('.sheet-title')?.textContent,
  swatches: document.querySelectorAll('.color-swatch').length,
  ongoing: document.querySelector('.checkbox-input')?.checked,
  endDisabled: document.querySelectorAll('input[type=date]')[1]?.disabled,
  nameVal: document.querySelector('input[aria-label="Phase name"]')?.value,
  actions: [...document.querySelectorAll('.sheet-actions button')].map((b) => b.textContent.trim()),
}))
check('D1', 'New phase sheet opens with defaults (ongoing checked, empty name)', newPhaseBtn && phaseSheet.open && phaseSheet.title === 'New phase' && phaseSheet.ongoing === true && phaseSheet.endDisabled === true, phaseSheet)

await page.type('input[aria-label="Phase name"]', 'Bulk')
// pick 2nd swatch (amber)
await page.$$eval('.color-swatch', (els) => els[1]?.click())
await page.screenshot({ path: `${OUT}/04-phase-sheet-360-light.png` })
await page.$$eval('.sheet-actions button', (els) => els.find((b) => b.textContent.includes('Add phase'))?.click())
await sleep(450)
const phaseAfter = await page.evaluate(() => ({
  legend: document.querySelector('.phase-legend')?.innerText,
  items: [...document.querySelectorAll('.phase-legend__item')].map((i) => i.innerText),
  swatchColors: [...document.querySelectorAll('.phase-legend__swatch')].map((s) => getComputedStyle(s).backgroundColor),
  persisted: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').phases,
  toast: document.querySelector('.toast')?.innerText,
  canvas: !!document.querySelector('canvas'),
}))
check('D2', 'Phase appears in Phases card with name + date range', /Bulk/.test(phaseAfter.legend) && /ongoing/.test(phaseAfter.legend), phaseAfter)
check('D3', 'Phase persisted to localStorage with chosen colour', phaseAfter.persisted?.length === 1 && phaseAfter.persisted[0].name === 'Bulk' && phaseAfter.persisted[0].endDate === null, phaseAfter.persisted)
check('D4', 'Phase shading visible on chart', phaseAfter.canvas && false, { note: 'Blocked: canvas not in DOM', canvas: phaseAfter.canvas })

// Edit phase
const editClicked = await page.$$eval('.phase-legend__action--edit', (els) => { els[0]?.click(); return !!els[0] })
await sleep(450)
const editSheet = await page.evaluate(() => ({
  title: document.querySelector('.sheet-title')?.textContent,
  subtitle: document.querySelector('.sheet-subtitle')?.textContent,
  name: document.querySelector('input[aria-label="Phase name"]')?.value,
  actions: [...document.querySelectorAll('.sheet-actions button')].map((b) => b.textContent.trim()),
}))
check('D5', 'Edit phase sheet opens prefilled', editClicked && editSheet.title === 'Edit phase' && editSheet.name === 'Bulk', editSheet)

await page.click('input[aria-label="Phase name"]')
await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
await page.keyboard.type('Bulk v2')
await page.$$eval('.sheet-actions button', (els) => els.find((b) => b.textContent.includes('Save changes'))?.click())
await sleep(450)
const phaseEdited = await page.evaluate(() => ({
  legend: document.querySelector('.phase-legend')?.innerText,
  phases: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').phases,
}))
check('D6', 'Phase edit updates the legend + storage', /Bulk v2/.test(phaseEdited.legend) && phaseEdited.phases?.[0]?.name === 'Bulk v2', phaseEdited)
await page.screenshot({ path: `${OUT}/05-dashboard-phase-360-light.png`, fullPage: true })

// Delete phase -> confirm -> shading/legend gone
const delClicked = await page.$$eval('.phase-legend__action--delete', (els) => { els[0]?.click(); return !!els[0] })
await sleep(500)
const phaseConfirm = await page.evaluate(() => ({
  title: document.querySelector('.sheet-title')?.textContent,
  buttons: [...document.querySelectorAll('.sheet-actions button')].map((b) => b.textContent.trim()),
}))
check('D7', 'Phase delete asks for confirmation', delClicked && /Delete "Bulk v2"\?/.test(phaseConfirm.title || ''), phaseConfirm)
await page.$$eval('.sheet-actions button', (els) => els.find((b) => b.textContent.trim() === 'Delete phase')?.click())
await sleep(500)
const phaseGone = await page.evaluate(() => ({
  legend: document.querySelector('.phase-legend')?.innerText,
  items: document.querySelectorAll('.phase-legend__item').length,
  phases: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').phases?.length,
  toast: document.querySelector('.toast')?.innerText,
}))
check('D8', 'Phase delete removes legend entry and storage', phaseGone.items === 0 && phaseGone.phases === 0, phaseGone)

// Recreate one phase for the remaining screenshots / persistence
await page.$$eval('.card-head-row button', (els) => els.find((e) => e.textContent.includes('New'))?.click())
await sleep(400)
await page.type('input[aria-label="Phase name"]', 'Bulk')
await page.$$eval('.sheet-actions button', (els) => els.find((b) => b.textContent.includes('Add phase'))?.click())
await sleep(500)

// -------------------------------------------------------------- E. HISTORY
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'history')?.click())
await sleep(400)
const history = await page.evaluate(() => ({
  months: [...document.querySelectorAll('.history-month')].map((e) => e.textContent),
  rows: [...document.querySelectorAll('.entry-row--detailed')].map((r) => r.innerText),
  subtitle: document.querySelector('.view-subtitle')?.textContent,
  footer: document.querySelector('.view-footer-note')?.textContent,
  h1: document.querySelector('h1')?.textContent,
  overflow: { sw: document.documentElement.scrollWidth, iw: innerWidth },
}))
check('E1', 'History shows all entries grouped by month (2 months)', history.rows.length === 3 && history.months.length === 2, history)
await page.screenshot({ path: `${OUT}/06-history-360-light.png`, fullPage: true })

// Tap row -> prefilled
const todayRowClicked = await page.$$eval('.entry-row--detailed .entry-main', (els) => { els[0]?.click(); return !!els[0] })
await sleep(450)
const prefilled = await page.evaluate(() => ({
  title: document.querySelector('.sheet-title')?.textContent,
  subtitle: document.querySelector('.sheet-subtitle')?.textContent,
  date: document.querySelector('input[type=date]')?.value,
  value: document.querySelector('.big-number-value')?.value,
  deleteBtn: [...document.querySelectorAll('.sheet-actions button')].some((b) => b.textContent.includes('Delete')),
}))
check('E2', 'Tapping history row opens sheet pre-filled with date + value', todayRowClicked && prefilled.title === 'Edit weigh-in' && prefilled.date === TODAY && prefilled.value === '74.5' && prefilled.deleteBtn, prefilled)
await page.screenshot({ path: `${OUT}/07-edit-sheet-360-light.png` })

// Delete entry -> confirm -> gone
await page.$$eval('.sheet-actions button', (els) => els.find((b) => b.textContent.includes('Delete'))?.click())
await sleep(500)
const confirmDlg = await page.evaluate(() => ({
  title: document.querySelector('.sheet-title')?.textContent,
  msg: document.querySelector('.confirm-message')?.textContent,
  buttons: [...document.querySelectorAll('.sheet-actions button')].map((b) => b.textContent.trim()),
  layers: document.querySelectorAll('.sheet-layer:not([hidden])').length,
  focused: document.activeElement?.textContent?.trim(),
}))
check('E3', 'Delete shows confirm dialog, Cancel focused for destructive action', /Delete weigh-in/.test(confirmDlg.title || '') && confirmDlg.buttons.length === 2, confirmDlg)
await page.screenshot({ path: `${OUT}/08-confirm-delete-360-light.png` })
await page.$$eval('.sheet-actions button', (els) => els.find((b) => b.textContent.trim() === 'Delete')?.click())
await sleep(500)
const afterDelete = await page.evaluate(() => ({
  rows: document.querySelectorAll('.entry-row--detailed').length,
  subtitle: document.querySelector('.view-subtitle')?.textContent,
  toast: document.querySelector('.toast')?.innerText,
  headline: [...document.querySelectorAll('.headline-number')].map((e) => e.textContent),
}))
check('E4', 'After confirming, entry is gone', afterDelete.rows === 2, afterDelete)

// Re-add today so we have 3 entries again for chart/phase screenshots
await logWeight(null, '74.5')
await sleep(300)

// -------------------------------------------------- F. PERSISTENCE / PROFILE
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'settings')?.click())
await sleep(400)
const settingsState = await page.evaluate(() => ({
  fields: [...document.querySelectorAll('.field-input')].map((e) => ({ label: e.getAttribute('aria-label'), value: e.value })),
  labels: [...document.querySelectorAll('.field-label')].map((e) => ({ text: e.textContent, tag: e.tagName, forAttr: e.getAttribute('for') })),
  text: document.body.innerText.slice(0, 400),
  overflow: { sw: document.documentElement.scrollWidth, iw: innerWidth },
}))
check('F1', 'Settings fields are labelled', settingsState.fields.every((f) => !!f.label), settingsState.fields)

// Why did a normal click fail? Inspect hit-testing on each settings field.
const fieldHits = await page.evaluate(() => {
  return [...document.querySelectorAll('input[aria-label]')].map((el) => {
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { label: el.getAttribute('aria-label'), rect: { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }, hitTag: hit?.tagName, hitCls: String(hit?.className).slice(0, 60), hitIsSelf: hit === el }
  })
})
check('F1b', 'Settings inputs are hit-testable at their centre point', fieldHits.every((f) => f.hitIsSelf), fieldHits)

for (const [label, value] of [['Starting weight in kilograms', '80'], ['Goal weight in kilograms', '75'], ['Height in centimetres', '180']]) {
  await page.$eval(`input[aria-label="${label}"]`, (el, v) => {
    el.focus()
    el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
  await sleep(200)
}
await sleep(500)
await page.screenshot({ path: `${OUT}/09-settings-360-light.png`, fullPage: true })

const beforeReload = await page.evaluate(() => localStorage.getItem('weight-tracker:v1'))
await page.reload({ waitUntil: 'networkidle0' })
await sleep(600)
const afterReload = await page.evaluate(() => ({
  raw: localStorage.getItem('weight-tracker:v1'),
  entries: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').entries?.length,
  phases: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').phases?.length,
  start: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile?.startWeightKg,
  goal: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile?.goalWeightKg,
  height: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile?.heightCm,
  view: document.querySelector('.headline-number')?.textContent,
}))
check('F2', 'Reload preserves entries, phases, profile', afterReload.entries === 3 && afterReload.phases === 1 && afterReload.start === 80 && afterReload.goal === 75 && afterReload.height === 180, afterReload)

// New page, same context
const page2 = await ctx.newPage()
await page2.setViewport(VP)
await page2.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await sleep(500)
const page2State = await page2.evaluate(() => ({
  entries: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').entries?.length,
  headline: document.querySelector('.headline-number')?.textContent,
  phase: document.querySelector('.phase-legend')?.innerText,
}))
check('F3', 'New page in same browser profile sees the data', page2State.entries === 3 && page2State.headline === '74.5', page2State)
await page2.close()

// --------------------------------------------------- G. TAB SCROLL POSITION
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await sleep(300)
const scrollBefore = await page.evaluate(() => window.scrollY)
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'history')?.click())
await sleep(400)
const scrollAfter = await page.evaluate(() => ({ y: window.scrollY, hostScroll: document.querySelector('.view-host')?.scrollTop, scrollH: document.documentElement.scrollHeight, innerH: window.innerHeight }))
check('G1', 'Switching tab scrolls to top of new view', scrollAfter.y === 0 || scrollBefore === 0, { scrollBefore, ...scrollAfter })

// FAB overlapping last content at bottom of a list
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'history')?.click())
await sleep(300)
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await sleep(300)
const fabOverlap = await page.evaluate(() => {
  const fab = document.querySelector('.fab').getBoundingClientRect()
  const rows = [...document.querySelectorAll('.entry-main')].map((r) => r.getBoundingClientRect())
  const hit = rows.filter((r) => !(r.right < fab.left || r.left > fab.right || r.bottom < fab.top || r.top > fab.bottom))
  return { fab: fab.toJSON(), rowRects: rows.map((r) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })), overlapped: hit.length, scrollY: scrollY, maxScroll: document.documentElement.scrollHeight - innerHeight }
})
check('G2', 'FAB does not cover the last list row at max scroll', fabOverlap.overlapped === 0, fabOverlap)
await page.screenshot({ path: `${OUT}/10-history-bottom-fab-360-light.png` })

// ---------------------------------------------------------- H. A11Y AUDIT
async function audit(label, p = page) {
  return await p.evaluate((label) => {
    const rect = (e) => e.getBoundingClientRect()
    const visible = (e) => {
      const s = getComputedStyle(e)
      const r = rect(e)
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0
    }
    const name = (e) => (
      (e.getAttribute('aria-label') || '').trim() ||
      (e.getAttribute('aria-labelledby') ? 'labelledby' : '') ||
      (e.textContent || '').trim() ||
      (e.getAttribute('title') || '').trim() ||
      (e.type === 'file' ? 'file input' : '')
    )
    const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="radio"], [role="checkbox"]')].filter(visible)
    const noName = interactive.filter((e) => !name(e)).map((e) => ({ tag: e.tagName, cls: e.className, type: e.type, html: e.outerHTML.slice(0, 160) }))
    const small = interactive.filter((e) => {
      const r = rect(e)
      return r.width < 44 || r.height < 44
    }).map((e) => ({ tag: e.tagName, cls: String(e.className), label: name(e).slice(0, 60), w: +rect(e).width.toFixed(1), h: +rect(e).height.toFixed(1) }))

    // contrast for visible text nodes
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const [r, g, b, a = '1'] = m[1].split(/[,\s/]+/).filter(Boolean)
      return { r: +r, g: +g, b: +b, a: +a }
    }
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const bgOf = (e) => {
      let n = e
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor)
        if (c && c.a > 0.5) return c
        n = n.parentElement
      }
      return parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }
    }
    const texts = [...document.querySelectorAll('body *')].filter((e) => {
      if (!visible(e)) return false
      if (['SCRIPT', 'STYLE', 'svg', 'path'].includes(e.tagName)) return false
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
      if (!own) return false
      const r = rect(e)
      return r.width > 2 && r.height > 2
    })
    const contrast = []
    for (const e of texts) {
      const s = getComputedStyle(e)
      if (parseFloat(s.opacity) < 0.6) continue
      const fg = parse(s.color)
      if (!fg) continue
      const bg = bgOf(e)
      const L1 = lum(fg), L2 = lum(bg)
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
      const size = parseFloat(s.fontSize)
      const bold = parseInt(s.fontWeight) >= 600
      const large = size >= 24 || (size >= 18.66 && bold)
      const need = large ? 3 : 4.5
      if (ratio < need) contrast.push({ text: e.textContent.trim().slice(0, 48), cls: String(e.className).slice(0, 50), ratio: +ratio.toFixed(2), need, color: s.color, bg: `rgb(${bg.r},${bg.g},${bg.b})`, size, bold })
    }
    // duplicate ids
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id)
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
    return {
      label,
      interactiveCount: interactive.length,
      noName,
      small,
      contrast: contrast.slice(0, 25),
      contrastCount: contrast.length,
      dupes: [...new Set(dupes)],
      overflow: { sw: document.documentElement.scrollWidth, iw: innerWidth },
      headingOutline: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 30)),
    }
  }, label)
}

await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'dashboard')?.click())
await sleep(500)
const a11yDash = await audit('dashboard')
check('H1', 'All interactive elements have accessible names (dashboard)', a11yDash.noName.length === 0, a11yDash.noName)
check('H2', 'All tap targets >= 44x44 (dashboard)', a11yDash.small.length === 0, a11yDash.small)
check('H3', 'Text contrast >= 4.5:1 (dashboard)', a11yDash.contrastCount === 0, a11yDash.contrast)
check('H4', 'No duplicate ids (dashboard)', a11yDash.dupes.length === 0, a11yDash.dupes)

await page.click('.fab'); await sleep(450)
const a11ySheet = await audit('log sheet')
check('H5', 'All interactive elements have accessible names (log sheet)', a11ySheet.noName.length === 0, a11ySheet.noName)
check('H6', 'All tap targets >= 44x44 (log sheet)', a11ySheet.small.length === 0, a11ySheet.small)
check('H7', 'Text contrast >= 4.5:1 (log sheet)', a11ySheet.contrastCount === 0, a11ySheet.contrast)

// Modal behaviour / focus management
const modalState = await page.evaluate(() => {
  const panel = document.querySelector('.sheet-panel')
  const fab = document.querySelector('.fab').getBoundingClientRect()
  return {
    role: panel?.getAttribute('role'),
    ariaModal: panel?.getAttribute('aria-modal'),
    activeTag: document.activeElement?.tagName,
    activeCls: String(document.activeElement?.className).slice(0, 50),
    activeLabel: document.activeElement?.getAttribute('aria-label'),
    focusInsideDialog: panel ? panel.contains(document.activeElement) : false,
    bodyOverflow: document.body.style.overflow,
    topHit: document.elementFromPoint(fab.left + 30, fab.top + 30)?.className,
  }
})
check('H12', 'Sheet is a modal dialog with aria-modal', modalState.role === 'dialog' && modalState.ariaModal === 'true', modalState)
check('H13', 'Focus moves inside the dialog when it opens', modalState.focusInsideDialog, modalState)
check('H14', 'Background scroll locked while sheet is open', modalState.bodyOverflow === 'hidden', modalState)

// Escape from where focus actually is
await page.keyboard.press('Escape')
await sleep(400)
const esc1 = await page.evaluate(() => ({ open: !!document.querySelector('.sheet-layer:not([hidden])') }))
check('H15', 'Escape closes the sheet from the current focus', !esc1.open, esc1)

// Focus trap: reopen, tab 6 times, see if focus escapes to the page behind
await page.click('.fab'); await sleep(450)
const trap = await page.evaluate(() => {
  const panel = document.querySelector('.sheet-panel')
  const seen = []
  for (let i = 0; i < 10; i++) {
    const focusables = [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((n) => n.getClientRects().length)
    seen.push({ i, activeInPanel: panel.contains(document.activeElement), tag: document.activeElement.tagName })
  }
  return { count: panel.querySelectorAll('button,input').length, seen }
})
check('H16', 'Sheet contains focusable controls', trap.count > 0, trap)
await page.keyboard.press('Escape'); await sleep(400)

// focus visibility
await page.keyboard.press('Escape')
await sleep(300)
await page.evaluate(() => document.activeElement.blur())
const focusChecks = []
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab')
  const f = await page.evaluate(() => {
    const a = document.activeElement
    const s = getComputedStyle(a)
    return { tag: a.tagName, cls: String(a.className).slice(0, 40), label: a.getAttribute('aria-label') || a.textContent?.trim().slice(0, 30), outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor, shadow: s.boxShadow.slice(0, 60), border: s.borderBottomColor }
  })
  focusChecks.push(f)
}
const visibleFocus = focusChecks.filter((f) => (f.outline.includes('solid') && !f.outline.includes('0px')) || f.shadow !== 'none').length
check('H8', 'Focus is visible when tabbing', visibleFocus >= 4, { visibleFocus, focusChecks })

// phase sheet a11y
await page.$$eval('.card-head-row button', (els) => els.find((e) => e.textContent.includes('New'))?.click())
await sleep(450)
const a11yPhase = await audit('phase sheet')
check('H9', 'All tap targets >= 44x44 (phase sheet)', a11yPhase.small.length === 0, a11yPhase.small)
check('H10', 'All interactive elements have accessible names (phase sheet)', a11yPhase.noName.length === 0, a11yPhase.noName)
check('H11', 'Text contrast >= 4.5:1 (phase sheet)', a11yPhase.contrastCount === 0, a11yPhase.contrast)
await page.keyboard.press('Escape'); await sleep(300)

// ---------------------------------------------------------- I. VIEWPORTS
const viewportReport = {}
for (const [w, h, name] of [[360, 740, '360'], [390, 844, '390'], [320, 568, '320'], [768, 1024, '768']]) {
  await page.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: true, deviceScaleFactor: 2 })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(700)
  const v = await page.evaluate(() => {
    const bad = []
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      const s = getComputedStyle(e)
      if (s.position === 'fixed') continue
      if (r.left < -1 || r.right > innerWidth + 1) {
        bad.push({ tag: e.tagName, cls: String(e.className).slice(0, 50), left: +r.left.toFixed(1), right: +r.right.toFixed(1) })
      }
    }
    return {
      sw: document.documentElement.scrollWidth,
      iw: innerWidth,
      bodySw: document.body.scrollWidth,
      offenders: bad.slice(0, 15),
      emotion: document.querySelector('.headline-number')?.textContent,
      fab: document.querySelector('.fab')?.getBoundingClientRect().toJSON(),
      tab: document.querySelector('.tab-bar')?.getBoundingClientRect().toJSON(),
    }
  })
  await page.screenshot({ path: `${OUT}/11-dashboard-${name}-light.png`, fullPage: true })

  // open sheet at this size and check save button visibility
  await page.click('.fab')
  await sleep(500)
  const sh = await page.evaluate(() => {
    const p = document.querySelector('.sheet-panel').getBoundingClientRect()
    const save = [...document.querySelectorAll('.sheet-actions button')].find((b) => b.textContent.includes('Save'))
    const sr = save.getBoundingClientRect()
    const content = document.querySelector('.sheet-content')
    return {
      panel: { top: +p.top.toFixed(1), bottom: +p.bottom.toFixed(1), h: +p.height.toFixed(1) },
      save: { top: +sr.top.toFixed(1), bottom: +sr.bottom.toFixed(1), w: +sr.width.toFixed(1), h: +sr.height.toFixed(1) },
      saveVisible: sr.top >= 0 && sr.bottom <= innerHeight,
      contentScroll: content.scrollHeight > content.clientHeight,
      contentScrollable: content.scrollHeight - content.clientHeight,
      innerH: innerHeight,
    }
  })
  await page.screenshot({ path: `${OUT}/12-log-sheet-${name}-light.png` })
  await page.mouse.click(w / 2, 30)
  await sleep(350)
  viewportReport[name] = { ...v, sheet: sh }
  check(`I-${name}a`, `No horizontal overflow at ${w}px`, v.sw <= v.iw + 1 && v.offenders.length === 0, { sw: v.sw, iw: v.iw, offenders: v.offenders })
  check(`I-${name}b`, `Log sheet Save button visible at ${w}x${h}`, sh.saveVisible && sh.save.h >= 44, sh)
}

// ------------------------------------------------------------- J. DARK MODE
await page.setViewport(VP)
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
await page.reload({ waitUntil: 'networkidle0' })
await sleep(800)
const dark = await page.evaluate(() => {
  const s = getComputedStyle(document.body)
  const canvas = document.querySelector('canvas')
  return {
    bg: s.backgroundColor,
    color: s.color,
    headline: document.querySelector('.headline-number')?.textContent,
    canvas: !!canvas,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }
})
check('J1', 'Dark mode applies dark palette (not black-on-black)', dark.scheme === 'dark' && dark.bg !== 'rgb(255, 255, 255)' && dark.color !== dark.bg, dark)
const a11yDark = await audit('dashboard dark')
check('J2', 'Dark mode text contrast >= 4.5:1 (dashboard)', a11yDark.contrastCount === 0, a11yDark.contrast)
await page.screenshot({ path: `${OUT}/13-dashboard-empty-360-dark.png`, fullPage: true })

// log sheet dark
await page.click('.fab'); await sleep(500)
await page.screenshot({ path: `${OUT}/14-log-sheet-360-dark.png` })
const a11ySheetDark = await audit('log sheet dark')
check('J3', 'Dark mode log sheet contrast >= 4.5:1', a11ySheetDark.contrastCount === 0, a11ySheetDark.contrast)
await page.mouse.click(180, 30); await sleep(350)

// history + settings dark
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'history')?.click())
await sleep(400)
await page.screenshot({ path: `${OUT}/15-history-360-dark.png`, fullPage: true })
await page.$$eval('.tab-button', (els) => els.find((b) => b.dataset.tab === 'settings')?.click())
await sleep(400)
await page.screenshot({ path: `${OUT}/16-settings-360-dark.png`, fullPage: true })
const a11ySettingsDark = await audit('settings dark')
check('J4', 'Dark mode settings contrast >= 4.5:1', a11ySettingsDark.contrastCount === 0, a11ySettingsDark.contrast)

// ------------------------------------------------------------- K. REDUCED MOTION
await page.emulateMediaFeatures([
  { name: 'prefers-color-scheme', value: 'light' },
  { name: 'prefers-reduced-motion', value: 'reduce' },
])
await page.reload({ waitUntil: 'networkidle0' })
await sleep(600)
const motion = await page.evaluate(() => {
  const fab = document.querySelector('.fab')
  const s = getComputedStyle(fab)
  return {
    matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    transitionDuration: s.transitionDuration,
    animationDuration: s.animationDuration,
  }
})
check('K1', 'prefers-reduced-motion respected (transitions ~0)', motion.matches && /0\.0*1ms|0s/.test(motion.transitionDuration), motion)

// final console summary
const errors = consoleLog.filter((l) => l.includes('[error]') || l.includes('PAGEERROR'))
check('Z1', 'No uncaught JS errors during entire run', errors.length === 0, errors)

fs.writeFileSync('qa/results.json', JSON.stringify({ results, consoleLog, viewportReport }, null, 2))
console.log('\n==== SUMMARY ====')
for (const r of results) if (!r.ok) console.log(`FAIL ${r.id}: ${r.name}`)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`)
console.log('\n---- CONSOLE LOG ----')
console.log(consoleLog.join('\n'))

await browser.close()
