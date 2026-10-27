/**
 * FINAL REGRESSION — part A
 * Items 1-11, 17, 18 (console cleanliness).
 * Read-only against src/; writes only to qa/.
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const daysAgo = (n) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
const TODAY = daysAgo(0)
const YESTERDAY = daysAgo(1)

const results = []
function check(id, name, ok, details) {
  const r = { id, name, ok: Boolean(ok), details }
  results.push(r)
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${id.padEnd(28)} ${name}`)
  if (details !== undefined) console.log('      ' + JSON.stringify(details).slice(0, 1600))
}

const createdAt = Date.now()
function makeEntries(count, startWeight = 82, step = 0.2, endOffset = 0) {
  // endOffset 0 => newest entry is today
  return Array.from({ length: count }, (_, i) => ({
    date: daysAgo(endOffset + count - 1 - i),
    weightKg: Math.round((startWeight - i * step) * 10) / 10,
    createdAt,
    updatedAt: createdAt,
  }))
}
const PROFILE = {
  startWeightKg: 82,
  goalWeightKg: 75,
  heightCm: 180,
  unit: 'kg',
  chartWindowDays: 90,
}
function seedState({ entries = [], phases = [], profile = PROFILE } = {}) {
  return { entries, phases, profile: { ...profile }, version: 1 }
}
const FORTY = makeEntries(40)
const FORTY_SEED = seedState({ entries: FORTY })

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const sessions = []
async function open({ seed, width = 360, height = 740, theme = 'light', reduced = true, go = true }) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  await page.setViewport({ width, height, isMobile: width < 520, hasTouch: true, deviceScaleFactor: 1 })
  const features = [{ name: 'prefers-color-scheme', value: theme }]
  if (reduced) features.push({ name: 'prefers-reduced-motion', value: 'reduce' })
  await page.emulateMediaFeatures(features)
  await page.evaluateOnNewDocument((value) => {
    try {
      localStorage.setItem('weight-tracker:v1', value)
    } catch {
      /* about:blank */
    }
  }, JSON.stringify(seed))
  if (go) {
    await page.goto(BASE, { waitUntil: 'networkidle0' })
    await page.reload({ waitUntil: 'networkidle0' })
  }
  const session = { context, page, errors }
  sessions.push(session)
  return session
}

async function waitChart(page) {
  await page.waitForFunction(
    () => {
      const c = document.querySelector('.chart-frame canvas')
      return c && c.width > 0 && c.height > 0
    },
    { timeout: 6000 },
  )
  await sleep(250)
}

async function storedState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('weight-tracker:v1') || 'null'))
}

async function setInput(page, selector, value) {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel)
      if (!el) throw new Error(`missing ${sel}`)
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    selector,
    value,
  )
}

async function openSheet(page) {
  await page.click('.fab')
  await page.waitForFunction(() => document.querySelector('.sheet-layer.is-open'))
  await sleep(320)
}

async function clearAndType(page, selector, text) {
  await page.click(selector)
  await sleep(60)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(text, { delay: 15 })
}

/* ========================================================================== */
/* ITEM 1 — canvas exists, in frame, sized, non-blank                          */
/* ========================================================================== */
{
  const { page, errors } = await open({ seed: FORTY_SEED })
  await waitChart(page)
  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const frame = document.querySelector('.chart-frame')
    const rect = canvas?.getBoundingClientRect()
    let dataUrlLen = 0
    let pixels = null
    if (canvas) {
      try {
        dataUrlLen = canvas.toDataURL().length
      } catch (e) {
        dataUrlLen = -1
      }
      try {
        const ctx = canvas.getContext('2d')
        const w = canvas.width
        const h = canvas.height
        const data = ctx.getImageData(0, 0, w, h).data
        const colors = new Set()
        let nonTransparent = 0
        let nonSurface = 0
        const step = 4 * 37
        for (let i = 0; i < data.length; i += step) {
          colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`)
          if (data[i + 3] > 0) nonTransparent++
          // canvas is transparent outside the filled area; count dark/mid pixels
          if (data[i + 3] > 0 && (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240)) nonSurface++
        }
        pixels = { width: w, height: h, uniqueColors: colors.size, nonTransparent, nonSurface }
      } catch (e) {
        pixels = { error: String(e) }
      }
    }
    return {
      canvasCount: document.querySelectorAll('canvas').length,
      insideFrame: Boolean(canvas && frame && frame.contains(canvas)),
      rect: rect ? { width: rect.width, height: rect.height, top: rect.top, left: rect.left } : null,
      offsetParent: canvas ? canvas.offsetParent !== null : false,
      dataUrlLen,
      pixels,
      ariaLabel: canvas?.getAttribute('aria-label'),
    }
  })
  check(
    '1-chart-canvas',
    'Canvas exists in .chart-frame, sized, and visibly drawn',
    info.canvasCount === 1 &&
      info.insideFrame &&
      info.rect &&
      info.rect.width > 100 &&
      info.rect.height > 100 &&
      info.offsetParent &&
      info.dataUrlLen > 5000 &&
      info.pixels &&
      info.pixels.uniqueColors > 10 &&
      info.pixels.nonSurface > 500,
    { ...info, errors },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 2 — phase shading changes the rendered chart                          */
/* ========================================================================== */
{
  const { page, errors } = await open({ seed: FORTY_SEED })
  await waitChart(page)
  const before = await page.evaluate(() => {
    const c = document.querySelector('.chart-frame canvas')
    const ctx = c.getContext('2d')
    const snapshot = new Uint8ClampedArray(ctx.getImageData(0, 0, c.width, c.height).data)
    window.__beforeChart = { w: c.width, h: c.height, data: snapshot }
    return { dataUrl: c.toDataURL(), w: c.width, h: c.height }
  })

  // Create phase "Bulk", ongoing, starting 14 days ago — through the UI.
  await page.click('section[aria-label="Training phases"] .button--small')
  await page.waitForFunction(() => document.querySelector('.sheet-layer.is-open'))
  await sleep(300)
  await page.type('input[aria-label="Phase name"]', 'Bulk')
  await setInput(page, 'input[aria-label="Phase start date"]', daysAgo(14))
  const ongoingChecked = await page.evaluate(
    () => document.querySelector('.checkbox-input')?.checked,
  )
  await page.click('.sheet-actions .button--primary')
  await sleep(900)
  await waitChart(page)

  const after = await page.evaluate(() => {
    const c = document.querySelector('.chart-frame canvas')
    const ctx = c.getContext('2d')
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    const beforeInfo = window.__beforeChart
    let diffPixels = 0
    let total = 0
    let maxDelta = 0
    if (beforeInfo && beforeInfo.w === c.width && beforeInfo.h === c.height) {
      for (let i = 0; i < data.length; i += 4) {
        total++
        const d = Math.max(
          Math.abs(data[i] - beforeInfo.data[i]),
          Math.abs(data[i + 1] - beforeInfo.data[i + 1]),
          Math.abs(data[i + 2] - beforeInfo.data[i + 2]),
          Math.abs(data[i + 3] - beforeInfo.data[i + 3]),
        )
        if (d > 6) diffPixels++
        if (d > maxDelta) maxDelta = d
      }
    }
    return {
      dataUrl: c.toDataURL(),
      diffPixels,
      total,
      maxDelta,
      legendText: document.querySelector('.phase-legend')?.innerText,
      phaseDots: document.querySelectorAll('.phase-legend__item').length,
      state: JSON.parse(localStorage.getItem('weight-tracker:v1') || 'null'),
    }
  })

  check(
    '2-phase-shading',
    'Creating an ongoing phase changes the chart image and updates the legend',
    before.dataUrl !== after.dataUrl &&
      after.diffPixels > 500 &&
      after.phaseDots === 1 &&
      /Bulk/.test(after.legendText || '') &&
      ongoingChecked === true &&
      after.state?.phases?.length === 1 &&
      after.state.phases[0].endDate === null,
    {
      beforeLen: before.dataUrl.length,
      afterLen: after.dataUrl.length,
      sameSize: before.w === after.w && before.h === after.h,
      diffPixels: after.diffPixels,
      totalPixels: after.total,
      maxDelta: after.maxDelta,
      ongoingChecked,
      legend: after.legendText,
      phase: after.state?.phases?.[0],
      errors,
    },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 3 — relative dates                                                    */
/* ========================================================================== */
{
  const entries = [
    { date: daysAgo(2), weightKg: 75.4 },
    { date: YESTERDAY, weightKg: 75.1 },
    { date: TODAY, weightKg: 74.5 },
  ].map((e) => ({ ...e, createdAt, updatedAt: createdAt }))
  const { page, errors } = await open({ seed: seedState({ entries }) })
  await waitChart(page)
  const rel = await page.evaluate(() => ({
    recent: [...document.querySelectorAll('[aria-label="Recent entries"] .entry-date')].map((n) =>
      n.textContent?.trim(),
    ),
    headlineDate: document.querySelector('.headline-date')?.textContent?.trim(),
    headline: document.querySelector('.headline-number')?.textContent?.trim(),
    bodyHasTomorrow: /Tomorrow/.test(document.body.innerText),
    entryWeights: [...document.querySelectorAll('[aria-label="Recent entries"] .entry-weight')].map(
      (n) => n.textContent?.trim(),
    ),
  }))
  check(
    '3-relative-dates',
    'Recent rows say Today / Yesterday / 2 days ago (never Tomorrow)',
    rel.recent[0] === 'Today' &&
      rel.recent[1] === 'Yesterday' &&
      rel.recent[2] === '2 days ago' &&
      rel.headlineDate === 'Today' &&
      !rel.bodyHasTomorrow,
    { ...rel, errors },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 4 — stat tiles do not overflow, equal heights, unit visible           */
/* ========================================================================== */
for (const [width, height] of [
  [320, 568],
  [360, 740],
  [390, 844],
  [768, 1024],
]) {
  const { page, errors } = await open({ seed: FORTY_SEED, width, height })
  await waitChart(page)
  const data = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.stat-tile')].map((tile) => {
      const tr = tile.getBoundingClientRect()
      const unit = tile.querySelector('.stat-unit')
      const ur = unit?.getBoundingClientRect()
      return {
        label: tile.querySelector('.stat-label')?.textContent?.trim(),
        scrollWidth: tile.scrollWidth,
        clientWidth: tile.clientWidth,
        width: tr.width,
        height: Number(tr.height.toFixed(2)),
        tileRight: tr.right,
        unitText: unit?.textContent?.trim() ?? null,
        unitScrollWidth: unit?.scrollWidth ?? null,
        unitClientWidth: unit?.clientWidth ?? null,
        unitWidth: ur?.width ?? null,
        unitLeft: ur?.left ?? null,
        unitRight: ur?.right ?? null,
        unitClipped: unit ? unit.scrollWidth > unit.clientWidth + 1 : false,
        unitInside: ur ? ur.left >= tr.left - 1 && ur.right <= tr.right + 1 : true,
      }
    })
    return {
      tiles,
      viewport: { w: innerWidth, h: innerHeight },
      docScrollWidth: document.documentElement.scrollWidth,
      gridCount: document.querySelectorAll('.stat-grid').length,
    }
  })
  const heights = data.tiles.map((t) => t.height)
  const equalHeights = heights.every((h) => Math.abs(h - heights[0]) <= 1)
  const noOverflow = data.tiles.every((t) => t.scrollWidth <= t.clientWidth + 1)
  const unitsOk = data.tiles
    .filter((t) => t.unitText)
    .every((t) => t.unitInside && !t.unitClipped)
  check(
    `4-stats-${width}`,
    'Stat tiles: no overflow, equal heights, unit fully visible',
    data.tiles.length === 6 && noOverflow && equalHeights && unitsOk,
    {
      viewport: data.viewport,
      count: data.tiles.length,
      equalHeights,
      heights,
      noOverflow,
      unitsOk,
      tiles: data.tiles,
      errors,
    },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 5 — tab switch resets scroll                                          */
/* ========================================================================== */
{
  const { page, errors } = await open({ seed: FORTY_SEED })
  await waitChart(page)
  await page.click('.tab-button[data-tab="history"]')
  await sleep(350)
  const historyInfo = await page.evaluate(() => ({
    rows: document.querySelectorAll('.entry-row').length,
    scrollHeight: document.documentElement.scrollHeight,
  }))
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await sleep(200)
  const beforeScroll = await page.evaluate(() => window.scrollY)
  await page.click('.tab-button[data-tab="settings"]')
  await sleep(500)
  const after = await page.evaluate(() => {
    const h1 = document.querySelector('.view--settings .view-title')
    const rect = h1?.getBoundingClientRect()
    return {
      scrollY: window.scrollY,
      docScrollTop: document.documentElement.scrollTop,
      h1Text: h1?.textContent,
      h1Top: rect?.top,
      activeTab: document.querySelector('.tab-button[aria-current="page"]')?.dataset.tab,
    }
  })
  check(
    '5-tab-scroll-reset',
    'Switching to Settings resets window scroll to top and shows the h1',
    beforeScroll > 200 &&
      after.scrollY < 5 &&
      after.h1Text === 'Settings' &&
      after.h1Top >= 0 &&
      after.h1Top < 100 &&
      after.activeTab === 'settings',
    { historyInfo, beforeScroll, ...after, errors },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 6 — editing the date MOVES the entry (no duplicate)                   */
/* ========================================================================== */
{
  const entries = [
    { date: YESTERDAY, weightKg: 75.1, createdAt, updatedAt: createdAt },
    { date: TODAY, weightKg: 74.5, createdAt, updatedAt: createdAt },
  ]
  const { page, errors } = await open({ seed: seedState({ entries }) })
  await waitChart(page)
  // Open today's entry from Recent.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('[aria-label="Recent entries"] .entry-row')].find(
      (r) => r.querySelector('.entry-date')?.textContent?.trim() === 'Today',
    )
    row?.querySelector('.entry-main')?.click()
  })
  await page.waitForFunction(() => document.querySelector('.sheet-layer.is-open'))
  await sleep(300)
  const beforeDate = await page.$eval('input[aria-label="Date of weigh-in"]', (el) => el.value)
  await setInput(page, 'input[aria-label="Date of weigh-in"]', YESTERDAY)
  await sleep(120)
  const labelAfterDate = await page.evaluate(
    () => document.querySelector('.log-date-info .field-label-text')?.textContent?.trim(),
  )
  await page.click('.sheet-actions .button--primary')
  await sleep(450)
  const state = await storedState(page)
  const counts = {
    total: state?.entries?.length,
    today: state?.entries?.filter((e) => e.date === TODAY).length,
    yesterday: state?.entries?.filter((e) => e.date === YESTERDAY).length,
  }
  const yEntry = state?.entries?.find((e) => e.date === YESTERDAY)
  check(
    '6-date-change-move',
    'Changing the date while editing moves the entry (2 entries, no duplicate)',
    beforeDate === TODAY &&
      counts.total === 2 &&
      counts.today === 0 &&
      counts.yesterday === 1 &&
      yEntry?.weightKg === 74.5,
    { beforeDate, labelAfterDate, counts, yesterdayEntry: yEntry, entries: state?.entries, errors },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 7 — goal card consistency                                            */
/* ========================================================================== */
{
  const entries = [{ date: TODAY, weightKg: 73, createdAt, updatedAt: createdAt }]
  const profile = { ...PROFILE, startWeightKg: 82, goalWeightKg: 75 }
  const { page, errors } = await open({ seed: seedState({ entries, profile }) })
  await waitChart(page)
  const goal = await page.evaluate(() => {
    const card = document.querySelector('section[aria-label="Goal progress"]')
    const pct = card?.querySelector('.goal-figure')?.textContent?.trim()
    const detail = card?.querySelector('.goal-detail')?.textContent?.trim()
    const bar = card?.querySelector('[role="progressbar"]')
    return {
      pct,
      detail,
      ariaNow: bar?.getAttribute('aria-valuenow'),
      fillWidth: card?.querySelector('.progress-fill')?.style.width,
      cardText: card?.innerText,
    }
  })
  check(
    '7-goal-consistency',
    'Goal card shows reached, not "100%" + "+2.0 kg to go"',
    goal.pct === '100%' &&
      /goal reached/i.test(goal.detail || '') &&
      !/to go/i.test(goal.cardText || '') &&
      !/\+2\.0 kg to go/i.test(goal.cardText || ''),
    { ...goal, errors },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 8 — weight input starts blank, typing replaces, implausible rejected  */
/* ========================================================================== */
{
  // (a) No prior entry: blank field, not "0.0"
  const { page, errors } = await open({ seed: seedState({ entries: [] }) })
  await sleep(300)
  await openSheet(page)
  const blank = await page.evaluate(() => {
    const input = document.querySelector('.big-number-value')
    return {
      value: input?.value,
      placeholder: input?.placeholder,
      displayedText: input?.outerHTML,
    }
  })
  check(
    '8a-blank-start',
    'Empty-state sheet shows an empty weight field (not "0.0")',
    blank.value === '' && blank.placeholder === '0' && !/0\.0/.test(blank.value || ''),
    { ...blank, errors },
  )

  // (b) Typing 74.5 replaces (with a frame between click and type, then a no-delay retry)
  await page.click('.big-number-value')
  await sleep(60)
  await page.keyboard.type('74.5', { delay: 18 })
  const typed = await page.$eval('.big-number-value', (el) => el.value)
  await page.click('.sheet-actions .button--primary')
  await sleep(400)
  const stateB = await storedState(page)
  check(
    '8b-typing-replaces',
    'Typing 74.5 into the field yields exactly "74.5" and stores 74.5',
    typed === '74.5' && stateB?.entries?.[0]?.weightKg === 74.5,
    { typed, stored: stateB?.entries, errors },
  )
  await page.close()
  await sessions.at(-1).context.close()

  // (b2) no delay between click and first keystroke
  {
    const s = await open({ seed: seedState({ entries: [] }) })
    await sleep(250)
    await openSheet(s.page)
    await s.page.click('.big-number-value')
    await s.page.keyboard.type('74.5')
    const v = await s.page.$eval('.big-number-value', (el) => el.value)
    check(
      '8b2-typing-no-delay',
      'Typing immediately after focus still replaces (no leading 0)',
      v === '74.5',
      { value: v, errors: s.errors },
    )
    await s.page.close()
    await sessions.at(-1).context.close()
  }

  // (c) 0.07 and 0.5 rejected
  {
    const s = await open({ seed: seedState({ entries: [] }) })
    await sleep(250)
    await openSheet(s.page)
    const rejection = {}
    for (const value of ['0.07', '0.5']) {
      await clearAndType(s.page, '.big-number-value', value)
      await s.page.click('.sheet-actions .button--primary')
      await sleep(350)
      const t = await s.page.evaluate(() => {
        const toast = document.querySelector('.toast')
        return {
          toastVisible: Boolean(toast && !toast.hidden && toast.classList.contains('is-visible')),
          toastText: toast?.textContent?.trim(),
          toastTone: toast?.dataset.tone,
          sheetOpen: Boolean(document.querySelector('.sheet-layer.is-open')),
          inputValue: document.querySelector('.big-number-value')?.value,
        }
      })
      rejection[value] = t
      await sleep(300)
    }
    const stateC = await storedState(s.page)
    check(
      '8c-implausible-rejected',
      'Saving 0.07 and 0.5 is rejected with an error toast and no entry',
      rejection['0.07'].toastVisible &&
        rejection['0.07'].toastTone === 'error' &&
        rejection['0.5'].toastVisible &&
        rejection['0.5'].toastTone === 'error' &&
        (stateC?.entries?.length ?? 0) === 0,
      { rejection, stored: stateC?.entries, errors: s.errors },
    )
    await s.page.close()
    await sessions.at(-1).context.close()
  }

  // (d) type 745 and save
  {
    const s = await open({ seed: seedState({ entries: [] }) })
    await sleep(250)
    await openSheet(s.page)
    await clearAndType(s.page, '.big-number-value', '745')
    await s.page.click('.sheet-actions .button--primary')
    await sleep(400)
    const afterSave = await s.page.evaluate(() => {
      const toast = document.querySelector('.toast')
      return {
        toastVisible: Boolean(toast && !toast.hidden && toast.classList.contains('is-visible')),
        toastText: toast?.textContent?.trim(),
        toastTone: toast?.dataset.tone,
        sheetOpen: Boolean(document.querySelector('.sheet-layer.is-open')),
      }
    })
    const stateD = await storedState(s.page)
    check(
      '8d-typing-745',
      'Typing 745 and saving stores 74.5 (not 0.1 / not rejected)',
      stateD?.entries?.length === 1 && stateD?.entries?.[0]?.weightKg === 74.5,
      { afterSave, stored: stateD?.entries, errors: s.errors },
    )
    await s.page.close()
    await sessions.at(-1).context.close()
  }

  // (b3) prefill then type should replace the prefill too
  {
    const entries = [{ date: YESTERDAY, weightKg: 75.3, createdAt, updatedAt: createdAt }]
    const s = await open({ seed: seedState({ entries }) })
    await sleep(250)
    await openSheet(s.page)
    const prefilled = await s.page.$eval('.big-number-value', (el) => el.value)
    await clearAndType(s.page, '.big-number-value', '74.5')
    const v = await s.page.$eval('.big-number-value', (el) => el.value)
    check(
      '8e-prefill-typing',
      'Prefilled field typing 74.5 yields exactly 74.5',
      prefilled === '75.3' && v === '74.5',
      { prefilled, value: v, errors: s.errors },
    )
    await s.page.close()
    await sessions.at(-1).context.close()
  }
}

/* ========================================================================== */
/* ITEM 9 — prefill from last weigh-in                                        */
/* ========================================================================== */
{
  const entries = [
    { date: daysAgo(2), weightKg: 75.0, createdAt, updatedAt: createdAt },
    { date: YESTERDAY, weightKg: 75.3, createdAt, updatedAt: createdAt },
  ]
  const { page, errors } = await open({ seed: seedState({ entries }) })
  await waitChart(page)
  await openSheet(page)
  const prefill = await page.evaluate(() => ({
    value: document.querySelector('.big-number-value')?.value,
    dateValue: document.querySelector('input[aria-label="Date of weigh-in"]')?.value,
    dateLabel: document.querySelector('.log-date-info .field-label-text')?.textContent?.trim(),
    title: document.querySelector('.sheet-title')?.textContent,
  }))
  check(
    '9-prefill-last',
    'New-date log sheet is prefilled with the most recent weight (75.3)',
    prefill.value === '75.3' && prefill.dateValue === TODAY,
    { ...prefill, errors },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 10 — sheet focus, Escape, focus trap                                  */
/* ========================================================================== */
{
  const { page, errors } = await open({ seed: FORTY_SEED })
  await waitChart(page)
  await openSheet(page)
  const focusIn = await page.evaluate(() => {
    const panel = document.querySelector('.sheet-panel')
    const active = document.activeElement
    return {
      insidePanel: Boolean(active && panel && panel.contains(active)),
      isFab: active?.classList?.contains('fab') ?? false,
      tag: active?.tagName,
      cls: active?.className,
      aria: active?.getAttribute?.('aria-label'),
    }
  })
  await page.keyboard.press('Escape')
  await sleep(400)
  const afterEsc = await page.evaluate(() => {
    const active = document.activeElement
    return {
      sheetOpen: Boolean(document.querySelector('.sheet-layer.is-open')),
      sheetPresent: Boolean(document.querySelector('.sheet-layer')),
      activeIsFab: active?.classList?.contains('fab') ?? false,
      activeTag: active?.tagName,
      activeAria: active?.getAttribute?.('aria-label'),
    }
  })

  // Reopen and test the Tab trap.
  await openSheet(page)
  const trapSetup = await page.evaluate(() => {
    const panel = document.querySelector('.sheet-panel')
    const focusable = [
      ...panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((n) => !n.hasAttribute('hidden') && n.getClientRects().length > 0)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    last.focus()
    return {
      count: focusable.length,
      first: { tag: first.tagName, cls: first.className, aria: first.getAttribute('aria-label') },
      last: { tag: last.tagName, cls: last.className, text: last.textContent?.trim() },
      activeIsLast: document.activeElement === last,
    }
  })
  await page.keyboard.press('Tab')
  await sleep(120)
  const afterTab = await page.evaluate(() => {
    const a = document.activeElement
    return { tag: a?.tagName, cls: a?.className, aria: a?.getAttribute?.('aria-label') }
  })
  const shiftSetup = await page.evaluate(() => {
    const panel = document.querySelector('.sheet-panel')
    const focusable = [
      ...panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((n) => !n.hasAttribute('hidden') && n.getClientRects().length > 0)
    // Put focus back on the last control, then verify Shift+Tab walks back to the first's predecessor.
    focusable[focusable.length - 1].focus()
    return { firstIsFirst: document.activeElement === focusable[focusable.length - 1] }
  })
  // From the last, Tab wraps to the first (already measured above? no: measured after Tab).
  // Now measure Shift+Tab from the first.
  await page.evaluate(() => {
    const panel = document.querySelector('.sheet-panel')
    const focusable = [
      ...panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((n) => !n.hasAttribute('hidden') && n.getClientRects().length > 0)
    focusable[0].focus()
    window.__firstEl = focusable[0]
  })
  const firstFocused = await page.evaluate(
    () => document.activeElement === window.__firstEl,
  )
  await page.keyboard.down('Shift')
  await page.keyboard.press('Tab')
  await page.keyboard.up('Shift')
  await sleep(120)
  const afterShiftTab = await page.evaluate(() => {
    const a = document.activeElement
    return { tag: a?.tagName, cls: a?.className, text: a?.textContent?.trim() }
  })

  const trapWorks =
    trapSetup.activeIsLast &&
    afterTab.cls?.includes('sheet-close') &&
    firstFocused &&
    (afterShiftTab.text?.includes('Save') ?? false)

  check(
    '10-sheet-focus',
    'Focus enters the sheet, Escape closes and restores FAB focus, Tab wraps both ways',
    focusIn.insidePanel &&
      !focusIn.isFab &&
      !afterEsc.sheetOpen &&
      afterEsc.activeIsFab &&
      trapWorks,
    {
      focusIn,
      afterEsc,
      trapSetup,
      afterTab,
      shiftSetup,
      firstFocused,
      afterShiftTab,
      trapWorks,
      errors,
    },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 11 — focus survives chart-range re-render                            */
/* ========================================================================== */
{
  const { page, errors } = await open({ seed: FORTY_SEED })
  await waitChart(page)
  await page.evaluate(() => {
    document.querySelector('[data-focus-key="chart-window:90"]')?.focus()
  })
  const initial = await page.evaluate(() => ({
    active: document.activeElement?.dataset?.focusKey,
    cls: document.activeElement?.className,
  }))
  await page.keyboard.press('ArrowRight')
  await sleep(600)
  const afterOne = await page.evaluate(() => {
    const active = document.activeElement
    return {
      activeKey: active?.dataset?.focusKey ?? null,
      cls: active?.className ?? null,
      isBody: active === document.body,
      isSegmentedOption: active?.classList?.contains('segmented-option') ?? false,
      ariaChecked: active?.getAttribute?.('aria-checked'),
      windowDays: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile
        ?.chartWindowDays,
      canvas: (() => {
        const c = document.querySelector('.chart-frame canvas')
        return c ? { w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height } : null
      })(),
    }
  })
  await page.keyboard.press('ArrowRight')
  await sleep(600)
  const afterTwo = await page.evaluate(() => {
    const active = document.activeElement
    return {
      activeKey: active?.dataset?.focusKey ?? null,
      isSegmentedOption: active?.classList?.contains('segmented-option') ?? false,
      windowDays: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile
        ?.chartWindowDays,
      checked: [...document.querySelectorAll('.segmented-option')]
        .filter((b) => b.getAttribute('aria-checked') === 'true')
        .map((b) => b.textContent?.trim()),
      chartAria: document.querySelector('.chart-frame canvas')?.getAttribute('aria-label'),
    }
  })
  check(
    '11-range-focus',
    'Focus stays on the segmented control and ArrowRight repeatedly changes range',
    initial.active === 'chart-window:90' &&
      afterOne.isSegmentedOption &&
      afterOne.activeKey === 'chart-window:180' &&
      afterOne.windowDays === 180 &&
      afterTwo.isSegmentedOption &&
      afterTwo.activeKey === 'chart-window:365' &&
      afterTwo.windowDays === 365 &&
      afterTwo.checked?.[0] === '1y',
    { initial, afterOne, afterTwo, errors },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 17 — BMI + volatility tiles                                           */
/* ========================================================================== */
{
  const { page, errors } = await open({ seed: FORTY_SEED })
  await waitChart(page)
  const tiles = await page.evaluate(() => {
    const grid = document.querySelector('.stat-grid')
    return [...grid.querySelectorAll('.stat-tile')].map((t) => ({
      label: t.querySelector('.stat-label')?.textContent?.trim(),
      value: t.querySelector('.stat-value')?.textContent?.trim(),
      unit: t.querySelector('.stat-unit')?.textContent?.trim() ?? null,
      sublabel: t.querySelector('.stat-sublabel')?.textContent?.trim() ?? null,
      visible: t.getClientRects().length > 0,
    }))
  })
  const bmi = tiles.find((t) => t.label === 'BMI')
  const vol = tiles.find((t) => t.label === 'Daily swing')
  check(
    '17-bmi-volatility',
    'BMI and Daily swing tiles appear when height is set',
    Boolean(bmi && vol) &&
      bmi.visible &&
      vol.visible &&
      bmi.value === '22.5' &&
      vol.unit === 'kg' &&
      tiles.length === 6,
    { tiles, errors },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* ITEM 18 — console errors, light and dark                                   */
/* ========================================================================== */
for (const theme of ['light', 'dark']) {
  const { page, errors } = await open({ seed: FORTY_SEED, theme })
  await waitChart(page)
  // Exercise a representative flow: open sheet, type, save, switch tabs, scroll.
  await openSheet(page)
  await clearAndType(page, '.big-number-value', '81.3')
  await page.click('.sheet-actions .button--primary')
  await sleep(400)
  await page.click('.tab-button[data-tab="history"]')
  await sleep(300)
  await page.click('.tab-button[data-tab="settings"]')
  await sleep(300)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await sleep(300)
  await page.click('.tab-button[data-tab="dashboard"]')
  await sleep(500)
  check(
    `18-console-${theme}`,
    `No console errors or page errors in ${theme} mode`,
    errors.length === 0,
    { errors },
  )
  await page.close()
  await sessions.at(-1).context.close()
}

/* ========================================================================== */
/* CLEANUP + REPORT                                                           */
/* ========================================================================== */
await browser.close()

const summary = {
  ranAt: new Date().toISOString(),
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  total: results.length,
  results,
}
fs.writeFileSync('qa/final-a-results.json', JSON.stringify(summary, null, 2))
console.log(`\n==== PART A: ${summary.passed} passed, ${summary.failed} failed (${summary.total}) ====`)
if (summary.failed > 0) process.exitCode = 1
