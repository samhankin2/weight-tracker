/**
 * Final regression verification for the weight tracker.
 * Read-only with respect to src/. Writes evidence + screenshots under qa/regression.
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const OUT = 'qa/regression'
const SHOTS = path.join(OUT, 'shots')
const DOWNLOADS = path.join(OUT, 'downloads')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(SHOTS, { recursive: true })
fs.mkdirSync(DOWNLOADS, { recursive: true })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const now = new Date()
const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
const TODAY = daysAgo(0)
const YESTERDAY = daysAgo(1)

const results = []
const consoleIssues = []
const notes = []

function check(id, name, ok, details) {
  const result = { id, name, ok: Boolean(ok), details }
  results.push(result)
  console.log(
    `${result.ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${
      details === undefined ? '' : ` :: ${JSON.stringify(details).slice(0, 1400)}`
    }`,
  )
  return result
}

let stamp = Date.now()
function entry(date, weightKg, note) {
  return { date, weightKg, note, createdAt: stamp++, updatedAt: stamp++ }
}

function makeSeed({ entries = [], phases = [], profile = {} } = {}) {
  return {
    entries,
    phases,
    profile: {
      startWeightKg: null,
      goalWeightKg: null,
      heightCm: null,
      unit: 'kg',
      chartWindowDays: 90,
      ...profile,
    },
    version: 1,
  }
}

function seriesEntries(count, { startKg = 82, step = -0.2, endOffset = 0 } = {}) {
  // count consecutive days ending `endOffset` days ago (0 = today).
  return Array.from({ length: count }, (_, i) => {
    const offset = endOffset + (count - 1 - i)
    const weight = Math.round((startKg + (step === 0 ? 0 : i * step)) * 10) / 10
    return entry(daysAgo(offset), weight)
  })
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

async function openApp({ seed, width = 360, height = 740, theme = 'light', label = 'app', wait = 700 }) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      consoleIssues.push({ label, type, text: msg.text() })
    }
  })
  page.on('pageerror', (error) => {
    consoleIssues.push({ label, type: 'pageerror', text: error.message })
  })
  await page.setViewport({
    width,
    height,
    isMobile: width < 520,
    hasTouch: true,
    deviceScaleFactor: 1,
  })
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  const seedText = JSON.stringify(seed)
  await page.evaluateOnNewDocument((value) => {
    try {
      localStorage.setItem('weight-tracker:v1', value)
    } catch {
      // initial about:blank
    }
  }, seedText)
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(wait)
  return { context, page, seedText }
}

async function laterPage(context, { width = 360, height = 740, theme = 'light', label = 'later' }) {
  const page = await context.newPage()
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') consoleIssues.push({ label, type, text: msg.text() })
  })
  page.on('pageerror', (error) => consoleIssues.push({ label, type: 'pageerror', text: error.message }))
  await page.setViewport({ width, height, isMobile: width < 520, hasTouch: true, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await sleep(700)
  return page
}

async function readState(page) {
  return page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('weight-tracker:v1') || 'null')
    } catch {
      return null
    }
  })
}

async function texts(page, selector) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel)].map((n) => n.textContent.trim()), selector)
}

async function chartInfo(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return { exists: false }
    const frame = canvas.closest('.chart-frame')
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    let alphaPixels = 0
    let sampled = 0
    let distinct = 0
    const seen = new Set()
    if (canvas.width > 0 && canvas.height > 0) {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 0; i < data.length; i += 16) {
        sampled++
        if (data[i + 3] > 0) {
          alphaPixels++
          const key = `${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`
          if (seen.size < 5000) seen.add(key)
        }
      }
      distinct = seen.size
    }
    let pixel = null
    if (canvas.width > 0 && canvas.height > 0) {
      const x = Math.min(canvas.width - 2, Math.round(canvas.width * 0.88))
      const y = Math.round(canvas.height * 0.55)
      pixel = Array.from(ctx.getImageData(x, y, 1, 1).data)
    }
    return {
      exists: true,
      inFrame: Boolean(frame),
      frameHidden: frame ? getComputedStyle(frame).display === 'none' : null,
      rect: { width: rect.width, height: rect.height },
      attr: { width: canvas.width, height: canvas.height },
      dataUrl: canvas.toDataURL(),
      dataUrlLength: canvas.toDataURL().length,
      alphaPixels,
      sampled,
      distinct,
      pixel,
      ariaLabel: canvas.getAttribute('aria-label'),
    }
  })
}

async function clickFab(page) {
  await page.click('.fab')
  await sleep(400)
}

async function focusAndType(page, text) {
  await page.click('.big-number-value')
  await sleep(180)
  await page.keyboard.type(text, { delay: 30 })
  await sleep(120)
}

async function clearAndType(page, text) {
  await page.click('.big-number-value')
  await sleep(120)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(text, { delay: 20 })
  await sleep(120)
}

async function readToast(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.toast')
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      text: el.textContent.trim(),
      tone: el.dataset.tone || null,
      visible: !el.hidden && el.classList.contains('is-visible'),
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
    }
  })
}

async function nativeValue(page, selector, value, eventType = 'change') {
  await page.evaluate(
    ({ selector, value, eventType }) => {
      const el = document.querySelector(selector)
      if (!el) throw new Error(`missing ${selector}`)
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      setter.call(el, value)
      el.dispatchEvent(new Event(eventType, { bubbles: true }))
    },
    { selector, value, eventType },
  )
  await sleep(120)
}

const clickText = async (page, selector, text) => {
  const clicked = await page.evaluate(
    ({ selector, text }) => {
      const match = [...document.querySelectorAll(selector)].find(
        (node) => node.textContent.trim() === text || node.textContent.includes(text),
      )
      if (!match) return false
      match.click()
      return true
    },
    { selector, text },
  )
  if (!clicked) throw new Error(`Could not find ${selector} containing ${text}`)
  await sleep(300)
}

try {
  // =========================================================================
  // Main seeded page: entries with today/yesterday/2-days-ago, phase, BMI.
  // =========================================================================
  const mainEntries = seriesEntries(40, { startKg: 82, step: -0.2 })
  const mainSeed = makeSeed({
    entries: mainEntries,
    phases: [
      { id: 'phase-bulk', name: 'Bulk', startDate: daysAgo(14), endDate: null, color: '#f59e0b', createdAt: stamp++ },
    ],
    profile: { startWeightKg: 80, goalWeightKg: 75, heightCm: 180 },
  })

  const mainRun = await openApp({ seed: mainSeed, width: 360, height: 740, theme: 'light', label: 'main-light' })
  const main = mainRun.page

  // ---- 1. Canvas in DOM, inside frame, non-blank -------------------------
  const chart = await chartInfo(main)
  const canvasCount = await main.evaluate(() => document.querySelectorAll('canvas').length)
  check(
    '1-canvas-exists',
    'Canvas exists in DOM, inside .chart-frame, non-zero size and non-blank pixels',
    chart.exists &&
      chart.inFrame &&
      chart.rect.width > 0 &&
      chart.rect.height > 0 &&
      chart.attr.width > 0 &&
      chart.attr.height > 0 &&
      chart.alphaPixels > 200 &&
      chart.distinct > 5 &&
      chart.dataUrlLength > 2000,
    {
      canvasCount,
      inFrame: chart.inFrame,
      frameHidden: chart.frameHidden,
      css: chart.rect,
      bitmap: chart.attr,
      dataUrlLength: chart.dataUrlLength,
      alphaPixels: chart.alphaPixels,
      sampled: chart.sampled,
      distinctColors: chart.distinct,
      ariaLabel: chart.ariaLabel,
    },
  )

  // Empty chart comparison (same viewport, no entries => canvas frame hidden).
  const emptyRun = await openApp({
    seed: makeSeed({ entries: [], phases: [], profile: { heightCm: 180 } }),
    width: 360,
    height: 740,
    theme: 'light',
    label: 'empty-chart',
  })
  const emptyChart = await chartInfo(emptyRun.page)
  check(
    '1-canvas-vs-empty',
    'Populated chart bitmap is much larger/non-blank vs the empty-state canvas',
    chart.dataUrlLength >= emptyChart.dataUrlLength * 2 &&
      chart.alphaPixels >= emptyChart.alphaPixels * 5 &&
      chart.dataUrl !== emptyChart.dataUrl,
    {
      populated: { length: chart.dataUrlLength, alphaPixels: chart.alphaPixels },
      empty: {
        length: emptyChart.dataUrlLength,
        alphaPixels: emptyChart.alphaPixels,
        frameHidden: emptyChart.frameHidden,
        note: 'empty canvas still paints its "No weigh-ins yet" message before the frame is hidden',
      },
      ratio: Number((chart.dataUrlLength / emptyChart.dataUrlLength).toFixed(2)),
      alphaRatio: Number((chart.alphaPixels / emptyChart.alphaPixels).toFixed(2)),
    },
  )
  await emptyRun.context.close()

  // ---- 2. Phase shading changes the bitmap ------------------------------
  const noPhaseEntries = seriesEntries(40, { startKg: 82, step: -0.2 })
  const noPhaseSeed = makeSeed({
    entries: noPhaseEntries,
    phases: [],
    profile: { startWeightKg: 80, goalWeightKg: 75, heightCm: 180 },
  })
  const noPhaseRun = await openApp({ seed: noPhaseSeed, width: 360, height: 740, theme: 'light', label: 'no-phase' })
  const noPhaseChart = await chartInfo(noPhaseRun.page)
  check(
    '2-phase-shading',
    'Chart bitmap differs when a phase is present vs no phase',
    chart.dataUrl !== noPhaseChart.dataUrl && chart.pixel?.join(',') !== noPhaseChart.pixel?.join(','),
    {
      withPhase: { dataUrlLength: chart.dataUrlLength, samplePixel: chart.pixel },
      noPhase: { dataUrlLength: noPhaseChart.dataUrlLength, samplePixel: noPhaseChart.pixel },
      identical: chart.dataUrl === noPhaseChart.dataUrl,
    },
  )
  await noPhaseRun.context.close()

  // ---- 3. Relative date labels ------------------------------------------
  const recentLabels = await texts(main, '[aria-label="Recent entries"] .entry-date')
  const headlineDate = (await texts(main, '.headline-date'))[0]
  const historyFooter = (await texts(main, '.view-footer-note'))[0]
  check(
    '3-relative-dates',
    'Recent/headline labels: Today, Yesterday (never Tomorrow), 2 days ago',
    recentLabels.includes('Today') &&
      recentLabels.includes('Yesterday') &&
      recentLabels.includes('2 days ago') &&
      !recentLabels.includes('Tomorrow') &&
      headlineDate === 'Today',
    { recentLabels, headlineDate, historyFooter },
  )
  const entryDateText = await main.evaluate(() => {
    const rows = [...document.querySelectorAll('[aria-label="Recent entries"] .entry-row')]
    return rows.map((row) => ({
      date: row.querySelector('.entry-date')?.textContent,
      aria: row.querySelector('.entry-main')?.getAttribute('aria-label'),
    }))
  })
  check(
    '3b-yesterday-not-tomorrow',
    'Yesterday entry specifically renders "Yesterday", not "Tomorrow"',
    entryDateText[1]?.date === 'Yesterday' && !JSON.stringify(entryDateText).includes('Tomorrow'),
    entryDateText,
  )

  // ---- 4. Stat tiles at 320/360/390/768 ---------------------------------
  for (const [w, h] of [
    [320, 568],
    [360, 740],
    [390, 844],
    [768, 1024],
  ]) {
    const run = await openApp({
      seed: mainSeed,
      width: w,
      height: h,
      theme: 'light',
      label: `tiles-${w}`,
      wait: 600,
    })
    const tileData = await run.page.evaluate(() => {
      return [...document.querySelectorAll('.stat-tile')].map((tile) => {
        const rect = tile.getBoundingClientRect()
        const unit = tile.querySelector('.stat-unit')
        const unitRect = unit?.getBoundingClientRect()
        const value = tile.querySelector('.stat-value')
        const valueRect = value?.getBoundingClientRect()
        return {
          label: tile.querySelector('.stat-label')?.textContent?.trim(),
          scrollWidth: tile.scrollWidth,
          clientWidth: tile.clientWidth,
          height: Number(rect.height.toFixed(2)),
          top: Number(rect.top.toFixed(2)),
          unitText: unit?.textContent ?? null,
          unitWidth: unitRect ? Number(unitRect.width.toFixed(2)) : null,
          unitScrollWidth: unit?.scrollWidth ?? null,
          unitClientWidth: unit?.clientWidth ?? null,
          unitInside: unitRect ? unitRect.left >= rect.left - 1 && unitRect.right <= rect.right + 1 : null,
          valueText: value?.textContent ?? null,
          valueScrollWidth: value?.scrollWidth ?? null,
          valueClientWidth: value?.clientWidth ?? null,
          valueRightOfTile: valueRect ? valueRect.right > rect.right + 1 : null,
        }
      })
    })
    const heights = tileData.map((t) => t.height)
    const equalHeights = heights.length > 0 && Math.max(...heights) - Math.min(...heights) <= 1
    const allContained = tileData.every((t) => t.scrollWidth <= t.clientWidth + 1)
    const unitsVisible = tileData
      .filter((t) => t.unitText)
      .every(
        (t) =>
          t.unitInside &&
          t.unitWidth > 0 &&
          (t.unitScrollWidth === null || t.unitScrollWidth <= t.unitClientWidth + 1),
      )
    check(
      `4-tiles-${w}`,
      `Stat tiles at ${w}px: no overflow, equal heights, units fully visible`,
      allContained && equalHeights && unitsVisible,
      {
        widths: tileData.map((t) => ({ label: t.label, sw: t.scrollWidth, cw: t.clientWidth })),
        heights,
        equalHeights,
        allContained,
        unitsVisible,
        units: tileData.map((t) => ({
          text: t.unitText,
          width: t.unitWidth,
          sw: t.unitScrollWidth,
          cw: t.unitClientWidth,
          inside: t.unitInside,
        })),
        values: tileData.map((t) => ({
          text: t.valueText,
          sw: t.valueScrollWidth,
          cw: t.valueClientWidth,
          beyondTile: t.valueRightOfTile,
        })),
      },
    )
    await run.context.close()
  }

  // ---- 5. Tab switch resets scroll --------------------------------------
  await main.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await sleep(250)
  const scrollBefore = await main.evaluate(() => window.scrollY)
  await main.click('.tab-button[data-tab="settings"]')
  await sleep(450)
  const scrollAfter = await main.evaluate(() => {
    const h1 = document.querySelector('.view--settings h1')
    return {
      scrollY: window.scrollY,
      h1Top: h1 ? h1.getBoundingClientRect().top : null,
      h1Text: h1?.textContent,
      docScrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      activeTab: document.querySelector('.tab-button[aria-current="page"]')?.dataset.tab,
    }
  })
  check(
    '5-tab-scroll-reset',
    'Switching History -> Settings resets scroll to top and Settings h1 is at viewport top',
    scrollBefore > 500 &&
      scrollAfter.scrollY < 5 &&
      scrollAfter.h1Top !== null &&
      scrollAfter.h1Top >= 0 &&
      scrollAfter.h1Top < 48 &&
      scrollAfter.activeTab === 'settings',
    { scrollBefore, ...scrollAfter },
  )

  // ---- 11. Focus preserved across segmented re-render -------------------
  await main.click('.tab-button[data-tab="dashboard"]')
  await sleep(500)
  await main.evaluate(() => {
    const opt = document.querySelector('.segmented-option[aria-checked="true"]')
    opt?.focus()
  })
  const segBefore = await main.evaluate(() => ({
    active: document.activeElement?.textContent,
    checked: document.activeElement?.getAttribute('aria-checked'),
    className: document.activeElement?.className,
  }))
  await main.keyboard.press('ArrowRight')
  await sleep(400)
  const segAfter1 = await main.evaluate(() => ({
    activeTag: document.activeElement?.tagName,
    activeClass: document.activeElement?.className,
    activeText: document.activeElement?.textContent,
    activeChecked: document.activeElement?.getAttribute('aria-checked'),
    selectedText: document.querySelector('.segmented-option[aria-checked="true"]')?.textContent,
    windowDays: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile?.chartWindowDays,
    canvasLabel: document.querySelector('canvas')?.getAttribute('aria-label'),
  }))
  await main.keyboard.press('ArrowRight')
  await sleep(400)
  const segAfter2 = await main.evaluate(() => ({
    activeClass: document.activeElement?.className,
    activeText: document.activeElement?.textContent,
    activeChecked: document.activeElement?.getAttribute('aria-checked'),
    selectedText: document.querySelector('.segmented-option[aria-checked="true"]')?.textContent,
    windowDays: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile?.chartWindowDays,
    canvasLabel: document.querySelector('canvas')?.getAttribute('aria-label'),
  }))
  check(
    '11-segmented-focus',
    'ArrowRight on segmented control keeps focus and a second press changes the range again',
    segAfter1.activeClass?.includes('segmented-option') &&
      segAfter1.activeChecked === 'true' &&
      segAfter1.selectedText === '6mo' &&
      segAfter1.windowDays === 180 &&
      segAfter2.activeClass?.includes('segmented-option') &&
      segAfter2.activeChecked === 'true' &&
      segAfter2.selectedText === '1y' &&
      segAfter2.windowDays === 365 &&
      segAfter2.activeText !== segAfter1.activeText,
    { segBefore, segAfter1, segAfter2 },
  )

  // Reset window to 90 for the remaining main-page checks.
  await main.evaluate(() => {
    const opt = [...document.querySelectorAll('.segmented-option')].find((o) => o.textContent === '90d')
    opt?.focus()
    opt?.click()
  })
  await sleep(400)

  // ---- 14. Segmented "All" visible at 320 --------------------------------
  {
    const run = await openApp({ seed: mainSeed, width: 320, height: 568, theme: 'light', label: 'seg-320' })
    const seg = await run.page.evaluate(() => {
      const control = document.querySelector('.segmented-control').getBoundingClientRect()
      const options = [...document.querySelectorAll('.segmented-option')].map((o) => {
        const r = o.getBoundingClientRect()
        return {
          text: o.textContent,
          left: Number(r.left.toFixed(2)),
          right: Number(r.right.toFixed(2)),
          width: Number(r.width.toFixed(2)),
          scrollWidth: o.scrollWidth,
          clientWidth: o.clientWidth,
          inside: r.left >= control.left - 1 && r.right <= control.right + 1,
        }
      })
      const el = document.querySelector('.segmented-control')
      return {
        control: { left: control.left, right: control.right, width: control.width },
        options,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflowX: getComputedStyle(el).overflowX,
      }
    })
    const all = seg.options.find((o) => o.text === 'All')
    check(
      '14-all-option-visible-320',
      'Segmented "All" option is fully inside the visible control at 320px',
      Boolean(all?.inside) && seg.scrollWidth <= seg.clientWidth + 1,
      seg,
    )
    await run.context.close()
  }

  // ---- 12. Tablet layout 768 --------------------------------------------
  {
    const run = await openApp({ seed: mainSeed, width: 768, height: 1024, theme: 'light', label: 'tablet' })
    const layout = await run.page.evaluate(() => {
      const rect = (el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
      }
      const tab = rect(document.querySelector('.tab-bar'))
      const shell = rect(document.querySelector('.app-shell'))
      const fab = rect(document.querySelector('.fab'))
      const buttons = [...document.querySelectorAll('.tab-button')].map((b) => ({
        tab: b.dataset.tab,
        ...rect(b),
      }))
      const overlaps = buttons.filter(
        (b) => fab.left < b.right && fab.right > b.left && fab.top < b.bottom && fab.bottom > b.top,
      )
      return { tab, shell, fab, buttons, overlaps, innerWidth }
    })
    check(
      '12-tablet-layout',
      'At 768px tab bar is 480px, FAB sits inside the content column by ~16px, and clears tab buttons',
      Math.abs(layout.tab.width - 480) <= 1 &&
        Math.abs(layout.tab.left - layout.shell.left) <= 1 &&
        Math.abs(layout.tab.right - layout.shell.right) <= 1 &&
        layout.fab.right <= layout.shell.right + 1 &&
        layout.shell.right - layout.fab.right <= 20 &&
        layout.overlaps.length === 0,
      layout,
    )
    await run.context.close()
  }

  // ---- 13. Toast does not overlap FAB -----------------------------------
  {
    await clickFab(main)
    await clearAndType(main, '0.5')
    await main.click('.sheet-actions .button--primary')
    await sleep(350)
    const toast = await readToast(main)
    const fab = await main.evaluate(() => {
      const r = document.querySelector('.fab').getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    })
    const intersects = (a, b) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    const withSheet = Boolean(toast) && intersects(toast.rect, fab)
    await main.keyboard.press('Escape')
    await sleep(400)
    const toastAfter = await readToast(main)
    const fabAfter = await main.evaluate(() => {
      const r = document.querySelector('.fab').getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    })
    const afterSheet = Boolean(toastAfter) && intersects(toastAfter.rect, fabAfter)
    check(
      '13-toast-clears-fab',
      'Error toast does not intersect the FAB (sheet open and closed)',
      toast?.tone === 'error' && !withSheet && !afterSheet,
      { toast, fab, intersectsWithSheetOpen: withSheet, toastAfter, fabAfter, intersectsAfterClose: afterSheet },
    )
  }

  // ---- 6. Changing date while editing moves entry -----------------------
  {
    const run = await openApp({
      seed: makeSeed({
        entries: [entry(YESTERDAY, 75.1), entry(TODAY, 74.5)],
        profile: { startWeightKg: 82, goalWeightKg: 75, heightCm: 180 },
      }),
      width: 360,
      height: 740,
      theme: 'light',
      label: 'move-date',
    })
    const p = run.page
    const rowsBefore = await texts(p, '[aria-label="Recent entries"] .entry-date')
    await p.click('[aria-label="Recent entries"] .entry-row .entry-main')
    await sleep(400)
    const editOpen = await p.evaluate(() => ({
      title: document.querySelector('.sheet-title')?.textContent,
      dateValue: document.querySelector('input[aria-label="Date of weigh-in"]')?.value,
      weightValue: document.querySelector('.big-number-value')?.value,
      subtitle: document.querySelector('.sheet-subtitle')?.textContent,
    }))
    await nativeValue(p, 'input[aria-label="Date of weigh-in"]', YESTERDAY, 'change')
    const dateLabelAfter = await p.evaluate(() => ({
      field: document.querySelector('.log-date-row .field-label-text')?.textContent,
      subtitle: document.querySelector('.sheet-subtitle')?.textContent,
    }))
    await p.click('.sheet-actions .button--primary')
    await sleep(500)
    const state = await readState(p)
    const entries = state?.entries ?? []
    const yesterday = entries.find((e) => e.date === YESTERDAY)
    const today = entries.find((e) => e.date === TODAY)
    const toast = await readToast(p)
    const rowsAfter = await texts(p, '[aria-label="Recent entries"] .entry-date')
    check(
      '6-edit-date-moves-entry',
      'Changing date while editing moves the entry (no duplicate, yesterday=74.5, today gone)',
      (entries.length === 2 || entries.length === 1) &&
        yesterday?.weightKg === 74.5 &&
        !today &&
        rowsAfter.filter((r) => r === 'Yesterday').length === 1,
      {
        specExpectedCount: 2,
        actualCount: entries.length,
        countNote:
          'A date-keyed store cannot hold two entries on the same date: moving today onto the occupied yesterday overwrites the old 75.1 and removes today, so 1 entry remains. No third/duplicate row is created.',
        rowsBefore,
        editOpen,
        dateLabelAfter,
        rowsAfter,
        entryCount: entries.length,
        entries: entries.map((e) => ({ date: e.date, weightKg: e.weightKg })),
        toast,
      },
    )
    await run.context.close()
  }

  // ---- 7. Goal card not self-contradictory ------------------------------
  {
    const run = await openApp({
      seed: makeSeed({
        entries: [entry(TODAY, 73)],
        profile: { startWeightKg: 82, goalWeightKg: 75, heightCm: 180 },
      }),
      width: 360,
      height: 740,
      theme: 'light',
      label: 'goal',
    })
    const goal = await run.page.evaluate(() => {
      const card = document.querySelector('[aria-label="Goal progress"]')
      return {
        exists: Boolean(card),
        figure: card?.querySelector('.goal-figure')?.textContent,
        detail: card?.querySelector('.goal-detail')?.textContent,
        ariaValue: card?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
        progressWidth: card?.querySelector('.progress-fill')?.style.width,
        fullText: card?.textContent.replace(/\s+/g, ' ').trim(),
      }
    })
    const contradictory = /100%/.test(goal.figure ?? '') && /to go/i.test(goal.detail ?? '')
    check(
      '7-goal-card',
      'Goal card shows Goal reached without contradicting "to go" text',
      goal.exists &&
        goal.figure === '100%' &&
        /goal reached/i.test(goal.detail ?? '') &&
        !/to go/i.test(goal.detail ?? '') &&
        !contradictory &&
        goal.ariaValue === '100',
      goal,
    )
    await run.context.close()
  }

  // ---- 8. Weight input behavior -----------------------------------------
  {
    const run = await openApp({
      seed: makeSeed({ entries: [], profile: { heightCm: 180 } }),
      width: 360,
      height: 740,
      theme: 'light',
      label: 'weight-input',
    })
    const p = run.page
    await clickFab(p)
    const initial = await p.evaluate(() => {
      const input = document.querySelector('.big-number-value')
      return {
        value: input?.value,
        placeholder: input?.placeholder,
        activeInSheet: Boolean(document.activeElement?.closest('.sheet-panel')),
        activeTag: document.activeElement?.tagName,
        activeLabel: document.activeElement?.getAttribute('aria-label'),
      }
    })
    await focusAndType(p, '74.5')
    const typed = await p.evaluate(() => document.querySelector('.big-number-value')?.value)
    check(
      '8a-blank-not-zero',
      'Log sheet starts empty (placeholder) instead of literal 0.0 when no prior entry',
      (initial.value === '' || initial.value === undefined) && initial.value !== '0.0' && initial.placeholder === '0',
      initial,
    )
    check(
      '8b-typing-replaces',
      'Typing 74.5 into the blank field yields exactly "74.5" (not 0.0745)',
      typed === '74.5',
      { typed },
    )

    // Reject 0.07
    await clearAndType(p, '0.07')
    await p.click('.sheet-actions .button--primary')
    await sleep(350)
    const low1 = { value: await p.evaluate(() => document.querySelector('.big-number-value')?.value), toast: await readToast(p) }
    const state1 = await readState(p)
    check(
      '8c-reject-0.07',
      'Saving 0.07 kg is rejected with an error toast and stores nothing',
      low1.toast?.tone === 'error' && /at least 20 kg/i.test(low1.toast?.text ?? '') && (state1?.entries?.length ?? 0) === 0,
      { ...low1, entries: state1?.entries?.length, sheetOpen: await p.evaluate(() => Boolean(document.querySelector('.sheet-layer.is-open'))) },
    )

    // Reject 0.5
    await clearAndType(p, '0.5')
    await p.click('.sheet-actions .button--primary')
    await sleep(350)
    const low2 = { value: await p.evaluate(() => document.querySelector('.big-number-value')?.value), toast: await readToast(p) }
    const state2 = await readState(p)
    check(
      '8d-reject-0.5',
      'Saving 0.5 kg is rejected with an error toast and stores nothing',
      low2.toast?.tone === 'error' && /at least 20 kg/i.test(low2.toast?.text ?? '') && (state2?.entries?.length ?? 0) === 0,
      { ...low2, entries: state2?.entries?.length },
    )

    // 745 -> should store 74.5 per spec
    await clearAndType(p, '745')
    await p.click('.sheet-actions .button--primary')
    await sleep(450)
    const typed745 = await p.evaluate(() => document.querySelector('.big-number-value')?.value)
    const state745 = await readState(p)
    const toast745 = await readToast(p)
    const stored745 = state745?.entries?.[0]
    check(
      '8e-745-becomes-74.5',
      'Typing 745 and saving stores 74.5 (currently: see evidence)',
      stored745?.weightKg === 74.5,
      {
        fieldValueBeforeSave: typed745,
        storedEntries: state745?.entries?.map((e) => ({ date: e.date, weightKg: e.weightKg })),
        toast: toast745,
        sheetStillOpen: await p.evaluate(() => Boolean(document.querySelector('.sheet-layer.is-open'))),
      },
    )
    await run.context.close()
  }

  // ---- 9. Prefill from last weigh-in ------------------------------------
  {
    const run = await openApp({
      seed: makeSeed({
        entries: [entry(daysAgo(2), 75.0), entry(YESTERDAY, 75.3)],
        profile: { heightCm: 180 },
      }),
      width: 360,
      height: 740,
      theme: 'light',
      label: 'prefill',
    })
    const p = run.page
    await clickFab(p)
    const prefill = await p.evaluate(() => ({
      value: document.querySelector('.big-number-value')?.value,
      dateValue: document.querySelector('input[aria-label="Date of weigh-in"]')?.value,
      title: document.querySelector('.sheet-title')?.textContent,
    }))
    await focusAndType(p, '74.5')
    const replaced = await p.evaluate(() => document.querySelector('.big-number-value')?.value)
    check(
      '9-prefill-last-weight',
      'New entry for today is prefilled with the most recent weight (75.3)',
      prefill.value === '75.3' && prefill.dateValue === TODAY && prefill.title === 'Log weight',
      prefill,
    )
    check(
      '9b-prefill-typing-replaces',
      'Focusing the prefilled field and typing 74.5 replaces it rather than appending',
      replaced === '74.5',
      { replaced },
    )
    await run.context.close()
  }

  // ---- 10. Sheet focus + Escape + focus trap ----------------------------
  {
    const run = await openApp({
      seed: makeSeed({ entries: [entry(YESTERDAY, 75.3)], profile: { heightCm: 180 } }),
      width: 360,
      height: 740,
      theme: 'light',
      label: 'sheet-focus',
    })
    const p = run.page
    await p.focus('.fab')
    const fabFocusBefore = await p.evaluate(() => ({
      isFab: document.activeElement === document.querySelector('.fab'),
      label: document.activeElement?.getAttribute('aria-label'),
    }))
    await p.keyboard.press('Enter')
    await sleep(450)
    const afterOpen = await p.evaluate(() => {
      const panel = document.querySelector('.sheet-layer.is-open .sheet-panel')
      const active = document.activeElement
      const focusables = panel
        ? [...panel.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(
            (n) => n.getClientRects().length > 0,
          )
        : []
      return {
        insidePanel: Boolean(active?.closest('.sheet-panel')),
        isFab: active === document.querySelector('.fab'),
        activeTag: active?.tagName,
        activeLabel: active?.getAttribute('aria-label'),
        focusableCount: focusables.length,
        firstLabel: focusables[0]?.getAttribute('aria-label') || focusables[0]?.className,
        lastLabel: focusables.at(-1)?.getAttribute('aria-label') || focusables.at(-1)?.textContent,
      }
    })

    // Tab from last wraps to first
    await p.evaluate(() => {
      const panel = document.querySelector('.sheet-layer.is-open .sheet-panel')
      const f = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(
        (n) => n.getClientRects().length > 0,
      )
      f.at(-1).focus()
    })
    await p.keyboard.press('Tab')
    await sleep(120)
    const tabWrap = await p.evaluate(() => {
      const panel = document.querySelector('.sheet-layer.is-open .sheet-panel')
      const f = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(
        (n) => n.getClientRects().length > 0,
      )
      return {
        atFirst: document.activeElement === f[0],
        activeLabel: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
      }
    })

    // Shift+Tab from first wraps to last
    await p.evaluate(() => {
      const panel = document.querySelector('.sheet-layer.is-open .sheet-panel')
      const f = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(
        (n) => n.getClientRects().length > 0,
      )
      f[0].focus()
    })
    await p.keyboard.down('Shift')
    await p.keyboard.press('Tab')
    await p.keyboard.up('Shift')
    await sleep(120)
    const shiftTabWrap = await p.evaluate(() => {
      const panel = document.querySelector('.sheet-layer.is-open .sheet-panel')
      const f = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(
        (n) => n.getClientRects().length > 0,
      )
      return {
        atLast: document.activeElement === f.at(-1),
        activeLabel: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent,
      }
    })

    await p.keyboard.press('Escape')
    await sleep(400)
    const afterEscape = await p.evaluate(() => ({
      sheetOpen: Boolean(document.querySelector('.sheet-layer.is-open')),
      sheetLayers: document.querySelectorAll('.sheet-layer').length,
      focusIsFab: document.activeElement === document.querySelector('.fab'),
      activeLabel: document.activeElement?.getAttribute('aria-label'),
      bodyOverflow: document.body.style.overflow,
    }))

    check(
      '10-sheet-focus',
      'Focus enters the sheet, Tab/Shift+Tab wrap, Escape closes and returns focus to FAB',
      afterOpen.insidePanel &&
        !afterOpen.isFab &&
        tabWrap.atFirst &&
        shiftTabWrap.atLast &&
        !afterEscape.sheetOpen &&
        afterEscape.focusIsFab &&
        afterEscape.bodyOverflow !== 'hidden',
      { fabFocusBefore, afterOpen, tabWrap, shiftTabWrap, afterEscape },
    )
    await run.context.close()
  }

  // ---- 17. BMI + volatility tiles ---------------------------------------
  {
    const run = await openApp({
      seed: makeSeed({ entries: seriesEntries(20, { startKg: 82, step: -0.2 }), profile: { heightCm: 180 } }),
      width: 390,
      height: 844,
      theme: 'light',
      label: 'bmi-tiles',
    })
    const tiles = await run.page.evaluate(() =>
      [...document.querySelectorAll('.stat-grid .stat-tile')].map((t) => ({
        label: t.querySelector('.stat-label')?.textContent?.trim(),
        value: t.querySelector('.stat-value')?.textContent,
        sublabel: t.querySelector('.stat-sublabel')?.textContent,
      })),
    )
    const labels = tiles.map((t) => t.label)
    check(
      '17-bmi-volatility-tiles',
      'BMI and Daily swing (volatility) tiles appear when height is set',
      labels.includes('BMI') && labels.includes('Daily swing'),
      tiles,
    )
    await run.context.close()
  }

  // ---- 15. PWA assets over dev server -----------------------------------
  {
    const base = BASE
    const manifestRes = await fetch(`${base}/manifest.webmanifest`)
    const manifestType = manifestRes.headers.get('content-type')
    const manifestText = await manifestRes.text()
    let manifest = null
    let manifestError = null
    try {
      manifest = JSON.parse(manifestText)
    } catch (error) {
      manifestError = String(error)
    }
    const assets = []
    for (const file of ['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']) {
      const res = await fetch(`${base}${file}`)
      const buf = Buffer.from(await res.arrayBuffer())
      assets.push({
        file,
        status: res.status,
        contentType: res.headers.get('content-type'),
        bytes: buf.length,
        signature: buf.subarray(0, 4).toString('hex'),
      })
    }
    check(
      '15-pwa-assets',
      'Manifest returns 200 + parses; icons return 200 image/png with PNG signature',
      manifestRes.status === 200 &&
        manifest !== null &&
        assets.every((a) => a.status === 200 && a.contentType?.includes('image/png') && a.signature === '89504e47'),
      {
        manifest: { status: manifestRes.status, contentType: manifestType, error: manifestError, name: manifest?.name, icons: manifest?.icons?.length },
        assets,
      },
    )
  }

  // =========================================================================
  // BROAD REGRESSION SWEEP
  // =========================================================================

  // ---- A. log -> headline -> history -> delete --------------------------
  {
    const run = await openApp({
      seed: makeSeed({ entries: [], profile: { heightCm: 180 } }),
      width: 360,
      height: 740,
      theme: 'light',
      label: 'sweep-log',
    })
    const p = run.page
    const empty = await p.evaluate(() => ({
      headline: document.querySelector('.headline-number')?.textContent,
      chartEmpty: document.querySelector('.chart-empty')?.textContent.replace(/\s+/g, ' ').trim(),
      recentEmpty: document.querySelector('[aria-label="Recent entries"] .empty-state-title')?.textContent,
    }))
    await clickFab(p)
    await focusAndType(p, '74.5')
    await p.click('.sheet-actions .button--primary')
    await sleep(600)
    const afterSave = await p.evaluate(() => ({
      headline: document.querySelector('.headline-number')?.textContent,
      headlineDate: document.querySelector('.headline-date')?.textContent,
      recent: [...document.querySelectorAll('[aria-label="Recent entries"] .entry-row')].map((r) =>
        r.textContent.replace(/\s+/g, ' ').trim(),
      ),
      toast: document.querySelector('.toast')?.textContent.trim(),
      chartLabel: document.querySelector('canvas')?.getAttribute('aria-label'),
      chartFrameHidden: document.querySelector('.chart-frame')?.classList.contains('is-hidden'),
    }))
    await p.click('.tab-button[data-tab="history"]')
    await sleep(400)
    const history = await p.evaluate(() => ({
      title: document.querySelector('.view--history .view-title')?.textContent,
      subtitle: document.querySelector('.view--history .view-subtitle')?.textContent,
      rows: [...document.querySelectorAll('.view--history .entry-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
      footer: document.querySelector('.view--history .view-footer-note')?.textContent,
    }))
    await p.click('.view--history .entry-main')
    await sleep(400)
    const edit = await p.evaluate(() => ({
      title: document.querySelector('.sheet-title')?.textContent,
      weight: document.querySelector('.big-number-value')?.value,
    }))
    await p.click('button[aria-label="Delete this weigh-in"]')
    await sleep(400)
    const confirmDialog = await p.evaluate(() => ({
      title: [...document.querySelectorAll('.sheet-layer.is-open .sheet-title')].map((n) => n.textContent),
      buttons: [...document.querySelectorAll('.sheet-layer.is-open .sheet-actions button')].map((b) => b.textContent.trim()),
    }))
    await clickText(p, '.sheet-layer.is-open .sheet-actions button', 'Delete')
    await sleep(600)
    const afterDelete = await p.evaluate(() => ({
      historyTitle: document.querySelector('.view--history .empty-state-title')?.textContent,
      rows: document.querySelectorAll('.view--history .entry-row').length,
      toast: document.querySelector('.toast')?.textContent.trim(),
    }))
    const state = await readState(p)
    check(
      'sweep-log-delete',
      'Log weight -> headline updates -> history shows it -> delete removes it',
      empty.headline === '—' &&
        afterSave.headline === '74.5' &&
        afterSave.headlineDate === 'Today' &&
        afterSave.recent.length === 1 &&
        /74.5/.test(afterSave.recent[0]) &&
        history.rows.length === 1 &&
        /74.5/.test(history.rows[0]) &&
        /Today/.test(history.footer ?? '') &&
        edit.title === 'Edit weigh-in' &&
        edit.weight === '74.5' &&
        (state?.entries?.length ?? -1) === 0 &&
        /No history yet/.test(afterDelete.historyTitle ?? ''),
      { empty, afterSave, history, edit, confirmDialog, afterDelete, storedEntries: state?.entries?.length },
    )
    await run.context.close()
  }

  // ---- B. phase create -> edit -> delete (legend + chart) ---------------
  {
    const run = await openApp({
      seed: makeSeed({ entries: seriesEntries(20, { startKg: 82, step: -0.2 }), profile: { heightCm: 180 } }),
      width: 360,
      height: 740,
      theme: 'light',
      label: 'sweep-phase',
    })
    const p = run.page
    const baseline = await chartInfo(p)
    const emptyLegend = await texts(p, '.phase-legend__empty')
    await p.evaluate(() => {
      const card = document.querySelector('section[aria-label="Training phases"]')
      card.querySelector('button.button--small').click()
    })
    await sleep(400)
    const newSheet = await p.evaluate(() => ({
      title: document.querySelector('.sheet-title')?.textContent,
      nameValue: document.querySelector('input[aria-label="Phase name"]')?.value,
      startValue: document.querySelector('input[aria-label="Phase start date"]')?.value,
      ongoing: document.querySelector('.checkbox-input')?.checked,
    }))
    await p.click('input[aria-label="Phase name"]')
    await p.keyboard.type('Bulk')
    await nativeValue(p, 'input[aria-label="Phase start date"]', daysAgo(14), 'change')
    await p.click('.sheet-actions .button--primary')
    await sleep(600)
    const afterCreate = await p.evaluate(() => ({
      names: [...document.querySelectorAll('.phase-legend__name')].map((n) => n.textContent),
      ranges: [...document.querySelectorAll('.phase-legend__range')].map((n) => n.textContent),
      legendEmpty: document.querySelectorAll('.phase-legend__empty').length,
      chartLabel: document.querySelector('canvas')?.getAttribute('aria-label'),
    }))
    const created = await chartInfo(p)
    const stateCreate = await readState(p)

    await p.click('button[aria-label="Edit Bulk phase"]')
    await sleep(400)
    await p.click('input[aria-label="Phase name"]')
    await p.keyboard.down('Control')
    await p.keyboard.press('KeyA')
    await p.keyboard.up('Control')
    await p.keyboard.type('Cut')
    await p.click('.sheet-actions .button--primary')
    await sleep(500)
    const afterEdit = await p.evaluate(() => ({
      names: [...document.querySelectorAll('.phase-legend__name')].map((n) => n.textContent),
      ranges: [...document.querySelectorAll('.phase-legend__range')].map((n) => n.textContent),
      state: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').phases?.map((ph) => ph.name),
    }))

    await p.click('button[aria-label="Delete Cut phase"]')
    await sleep(400)
    const confirmTitle = await p.evaluate(() => document.querySelector('.sheet-layer.is-open .sheet-title')?.textContent)
    await clickText(p, '.sheet-layer.is-open .sheet-actions button', 'Delete phase')
    await sleep(600)
    const afterDelete = await p.evaluate(() => ({
      names: [...document.querySelectorAll('.phase-legend__name')].map((n) => n.textContent),
      empty: document.querySelector('.phase-legend__empty')?.textContent,
      phases: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').phases?.length,
    }))
    const deleted = await chartInfo(p)

    check(
      'sweep-phase-crud',
      'Create/edit/delete phase updates legend and chart shading',
      emptyLegend[0] === 'No phases yet' &&
        newSheet.title === 'New phase' &&
        newSheet.ongoing === true &&
        afterCreate.names.join(',') === 'Bulk' &&
        /ongoing/.test(afterCreate.ranges[0] ?? '') &&
        (stateCreate?.phases?.length ?? 0) === 1 &&
        created.dataUrl !== baseline.dataUrl &&
        afterEdit.names.join(',') === 'Cut' &&
        afterEdit.state?.join(',') === 'Cut' &&
        confirmTitle?.includes('Cut') &&
        afterDelete.names.length === 0 &&
        afterDelete.empty === 'No phases yet' &&
        afterDelete.phases === 0 &&
        deleted.dataUrl !== created.dataUrl,
      {
        baselineLength: baseline.dataUrlLength,
        emptyLegend,
        newSheet,
        afterCreate,
        createdLength: created.dataUrlLength,
        afterEdit,
        confirmTitle,
        afterDelete,
        deletedLength: deleted.dataUrlLength,
        chartRestored: deleted.dataUrl === baseline.dataUrl,
      },
    )
    await run.context.close()
  }

  // ---- C. settings persist across reload -------------------------------
  {
    const run = await openApp({
      seed: makeSeed({
        entries: seriesEntries(5, { startKg: 82, step: -0.3 }),
        phases: [
          { id: 'phase-export', name: 'Bulk', startDate: daysAgo(10), endDate: null, color: '#f59e0b', createdAt: stamp++ },
        ],
        profile: {},
      }),
      width: 360,
      height: 740,
      theme: 'light',
      label: 'sweep-settings',
    })
    const p = run.page
    await p.click('.tab-button[data-tab="settings"]')
    await sleep(400)
    for (const [label, value] of [
      ['Starting weight in kilograms', '82'],
      ['Goal weight in kilograms', '75'],
      ['Height in centimetres', '180'],
    ]) {
      await p.evaluate(
        ({ label, value }) => {
          const input = document.querySelector(`input[aria-label="${label}"]`)
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, value)
          input.dispatchEvent(new Event('change', { bubbles: true }))
        },
        { label, value },
      )
      await sleep(350)
    }
    const savedProfile = (await readState(p))?.profile
    // New page in the same context: no seed script, so it must read persisted storage.
    const p2 = await laterPage(run.context, { width: 360, height: 740, theme: 'light', label: 'sweep-settings-reload' })
    await p2.click('.tab-button[data-tab="settings"]')
    await sleep(400)
    const reloaded = await p2.evaluate(() => ({
      start: document.querySelector('input[aria-label="Starting weight in kilograms"]')?.value,
      goal: document.querySelector('input[aria-label="Goal weight in kilograms"]')?.value,
      height: document.querySelector('input[aria-label="Height in centimetres"]')?.value,
      stored: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile,
    }))
    await p2.click('.tab-button[data-tab="dashboard"]')
    await sleep(500)
    const bmiTile = await p2.evaluate(() => ({
      labels: [...document.querySelectorAll('.stat-grid .stat-label')].map((n) => n.textContent.trim()),
      bmi: [...document.querySelectorAll('.stat-grid .stat-tile')]
        .find((t) => t.querySelector('.stat-label')?.textContent.trim() === 'BMI')
        ?.querySelector('.stat-value')?.textContent,
      goal: document.querySelector('[aria-label="Goal progress"] .goal-figure')?.textContent,
    }))
    check(
      'sweep-settings-persist',
      'Start weight, goal, height persist across reload and drive BMI/goal UI',
      savedProfile?.startWeightKg === 82 &&
        savedProfile?.goalWeightKg === 75 &&
        savedProfile?.heightCm === 180 &&
        reloaded.start === '82' &&
        reloaded.goal === '75' &&
        reloaded.height === '180' &&
        reloaded.stored?.heightCm === 180 &&
        bmiTile.labels.includes('BMI') &&
        bmiTile.goal !== undefined,
      { savedProfile, reloaded, bmiTile },
    )

    // ---- D. Export / import ---------------------------------------------
    // Return to Settings (the BMI check above navigated to the dashboard).
    await p2.click('.tab-button[data-tab="settings"]')
    await sleep(450)
    const session = await p2.createCDPSession()
    await session.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: path.resolve(DOWNLOADS),
      eventsEnabled: true,
    })
    const beforeExport = await readState(p2)
    const downloadDirs = [path.resolve(DOWNLOADS), path.join(process.env.USERPROFILE || '', 'Downloads')]
    const exportStarted = Date.now()
    const existingBackups = new Set()
    for (const dir of downloadDirs) {
      if (!fs.existsSync(dir)) continue
      for (const file of fs.readdirSync(dir)) {
        if (/^weight-backup-.*\.json$/.test(file)) existingBackups.add(path.join(dir, file))
      }
    }
    await p2.evaluate(() => {
      const button = [...document.querySelectorAll('.view--settings button')].find((b) =>
        b.textContent.includes('Export data'),
      )
      button.click()
    })
    let exportedFile = null
    for (let i = 0; i < 60; i++) {
      const candidates = []
      for (const dir of downloadDirs) {
        if (!fs.existsSync(dir)) continue
        for (const file of fs.readdirSync(dir)) {
          if (!/^weight-backup-.*\.json$/.test(file)) continue
          const full = path.join(dir, file)
          const stat = fs.statSync(full)
          if (stat.mtimeMs >= exportStarted - 1000 && (!existingBackups.has(full) || stat.mtimeMs >= exportStarted - 1000)) {
            candidates.push({ full, mtime: stat.mtimeMs })
          }
        }
      }
      candidates.sort((a, b) => b.mtime - a.mtime)
      if (candidates.length > 0) {
        exportedFile = candidates[0].full
        break
      }
      await sleep(150)
    }
    let exported = null
    if (exportedFile) {
      // Wait for the download to finish writing (Chrome may use .crdownload first).
      for (let i = 0; i < 40; i++) {
        try {
          exported = JSON.parse(fs.readFileSync(exportedFile, 'utf8'))
          break
        } catch {
          await sleep(150)
        }
      }
    }

    // Reset, then import the backup.
    await p2.evaluate(() => {
      const button = [...document.querySelectorAll('.view--settings .button--danger')].find((b) =>
        b.textContent.includes('Delete all data'),
      )
      button.click()
    })
    await sleep(400)
    await clickText(p2, '.sheet-layer.is-open .sheet-actions button', 'Delete everything')
    await sleep(500)
    const afterReset = await readState(p2)
    const fileInput = await p2.$('input[type="file"]')
    let importResult = { uploaded: false, error: null }
    if (exportedFile && fileInput) {
      try {
        await fileInput.uploadFile(exportedFile)
        importResult.uploaded = true
      } catch (error) {
        importResult.error = String(error)
      }
    }
    await sleep(900)
    const afterImport = await readState(p2)
    const importToast = await readToast(p2)
    const importUi = await p2.evaluate(() => ({
      activeTab: document.querySelector('.tab-button[aria-current="page"]')?.dataset.tab,
      hint: [...document.querySelectorAll('.view--settings .card-hint')].map((n) => n.textContent.trim()),
      entryRows: document.querySelectorAll('.entry-row').length,
    }))
    check(
      'sweep-export-import',
      'Export produces a valid JSON backup and import restores it',
      exported !== null &&
        exported.entries?.length === beforeExport?.entries?.length &&
        afterReset?.entries?.length === 0 &&
        afterImport?.entries?.length === beforeExport?.entries?.length &&
        afterImport?.phases?.length === beforeExport?.phases?.length &&
        /Backup restored/.test(importToast?.text ?? ''),
      {
        exportedFile,
        exported: exported
          ? { entries: exported.entries?.length, phases: exported.phases?.length, profile: exported.profile }
          : null,
        beforeExport: { entries: beforeExport?.entries?.length, phases: beforeExport?.phases?.length },
        afterReset: { entries: afterReset?.entries?.length, phases: afterReset?.phases?.length },
        importResult,
        afterImport: { entries: afterImport?.entries?.length, phases: afterImport?.phases?.length, profile: afterImport?.profile },
        importToast,
        importUi,
      },
    )
    await run.context.close()
  }

  // ---- E. dark mode + no horizontal overflow ---------------------------
  {
    for (const theme of ['light', 'dark']) {
      const run = await openApp({
        seed: mainSeed,
        width: 360,
        height: 740,
        theme,
        label: `theme-${theme}`,
      })
      const colors = await run.page.evaluate(() => ({
        bodyBg: getComputedStyle(document.body).backgroundColor,
        text: getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim(),
        surface: getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim(),
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        canvas: (() => {
          const c = document.querySelector('canvas')
          const r = c?.getBoundingClientRect()
          const card = c?.closest('.chart-card')?.getBoundingClientRect()
          return c ? { width: r.width, right: r.right, cardRight: card?.right } : null
        })(),
      }))
      check(
        `sweep-theme-${theme}`,
        `Dashboard renders in ${theme} mode without horizontal overflow`,
        colors.docScrollWidth <= colors.innerWidth + 1 &&
          colors.text.length > 0 &&
          (() => {
            const m = colors.bodyBg.match(/\d+/g)?.map(Number) ?? [0, 0, 0]
            const luminance = (m[0] + m[1] + m[2]) / 3
            return theme === 'dark' ? luminance < 90 : luminance > 200
          })() &&
          colors.canvas.width > 0 &&
          colors.canvas.right <= (colors.canvas.cardRight ?? colors.canvas.right) + 1,
        colors,
      )
      await run.context.close()
    }

    const run = await openApp({ seed: mainSeed, width: 320, height: 568, theme: 'light', label: 'overflow-320' })
    const reports = []
    for (const tab of ['dashboard', 'history', 'settings']) {
      await run.page.click(`.tab-button[data-tab="${tab}"]`)
      await sleep(450)
      const report = await run.page.evaluate(() => {
        const inner = window.innerWidth
        const offenders = [...document.querySelectorAll('*')]
          .filter((el) => {
            const r = el.getBoundingClientRect()
            if (r.width <= 0 || r.height <= 0) return false
            return r.right > inner + 1 || r.left < -1
          })
          .slice(0, 12)
          .map((el) => {
            const r = el.getBoundingClientRect()
            return {
              tag: el.tagName,
              cls: String(el.className).slice(0, 70),
              left: Number(r.left.toFixed(1)),
              right: Number(r.right.toFixed(1)),
              width: Number(r.width.toFixed(1)),
            }
          })
        return {
          tab: document.querySelector('.tab-button[aria-current="page"]')?.dataset.tab,
          innerWidth: inner,
          docScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          offenders,
        }
      })
      reports.push(report)
    }
    check(
      'sweep-no-horizontal-overflow-320',
      'No horizontal page overflow at 320px on dashboard/history/settings',
      reports.every((r) => r.docScrollWidth <= r.innerWidth + 1 && r.bodyScrollWidth <= r.innerWidth + 1),
      reports,
    )
    await run.context.close()
  }

  // =========================================================================
  // VISUAL SCREENSHOTS (360x740, light + dark)
  // =========================================================================
  {
    // Entries stop at yesterday so the log sheet demonstrates prefill (and the
    // dashboard shows "Yesterday"/"2 days ago").
    const visualEntries = seriesEntries(30, { startKg: 82, step: -0.24, endOffset: 1 })
    const visualSeed = makeSeed({
      entries: visualEntries,
      phases: [
        { id: 'phase-bulk', name: 'Bulk', startDate: daysAgo(14), endDate: null, color: '#f59e0b', createdAt: stamp++ },
      ],
      profile: { startWeightKg: 82, goalWeightKg: 75, heightCm: 180 },
    })
    for (const theme of ['light', 'dark']) {
      const run = await openApp({ seed: visualSeed, width: 360, height: 740, theme, label: `visual-${theme}` })
      const p = run.page
      await p.screenshot({ path: path.join(SHOTS, `dashboard-360-${theme}.png`), fullPage: true })
      await clickFab(p)
      const sheetState = await p.evaluate(() => ({
        title: document.querySelector('.sheet-title')?.textContent,
        weight: document.querySelector('.big-number-value')?.value,
        date: document.querySelector('input[aria-label="Date of weigh-in"]')?.value,
        activeLabel: document.activeElement?.getAttribute('aria-label'),
        panelRect: document.querySelector('.sheet-panel')?.getBoundingClientRect().toJSON(),
        actionsRect: document.querySelector('.sheet-actions')?.getBoundingClientRect().toJSON(),
        innerHeight: window.innerHeight,
      }))
      await p.screenshot({ path: path.join(SHOTS, `sheet-360-${theme}.png`) })
      notes.push({ theme, sheetState })
      await p.keyboard.press('Escape')
      await sleep(350)
      await p.click('.tab-button[data-tab="history"]')
      await sleep(450)
      await p.screenshot({ path: path.join(SHOTS, `history-360-${theme}.png`), fullPage: true })
      await p.click('.tab-button[data-tab="settings"]')
      await sleep(450)
      await p.screenshot({ path: path.join(SHOTS, `settings-360-${theme}.png`), fullPage: true })
      await run.context.close()
    }
  }

  // ---- 18. Console errors ------------------------------------------------
  const errors = consoleIssues.filter((i) => i.type === 'error' || i.type === 'pageerror')
  const warnings = consoleIssues.filter((i) => i.type === 'warning')
  const themesSeen = new Set(
    consoleIssues
      .map((i) => i.label)
      .filter((l) => l.startsWith('main-light') || l.startsWith('theme-')),
  )
  check(
    '18-no-console-errors',
    'No console errors or page errors in light or dark mode',
    errors.length === 0,
    { errorCount: errors.length, errors: errors.slice(0, 20), warningCount: warnings.length, warnings: warnings.slice(0, 10), themesSeen: [...themesSeen] },
  )
} finally {
  await browser.close()
}

const summary = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  total: results.length,
  results,
  consoleIssues,
  notes,
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'regression-results.json'), JSON.stringify(summary, null, 2))
console.log(`\n==== REGRESSION SUMMARY: ${summary.passed} passed, ${summary.failed} failed (${summary.total} total) ====`)
if (summary.failed > 0) process.exitCode = 1
