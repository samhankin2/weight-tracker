import puppeteer from 'puppeteer'
import fs from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = 'qa/screenshots'
const VIEWPORTS = [
  [320, 568],
  [360, 740],
  [390, 844],
  [768, 1024],
]
const THEMES = ['light', 'dark']
const results = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const iso = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const now = new Date()
const daysAgo = (count) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - count))

fs.mkdirSync(OUT, { recursive: true })

const createdAt = Date.now()
const entries = Array.from({ length: 40 }, (_, index) => ({
  date: daysAgo(39 - index),
  weightKg: Math.round((82 - index * 0.2) * 10) / 10,
  createdAt,
  updatedAt: createdAt,
}))
const seed = JSON.stringify({
  entries,
  phases: [
    {
      id: 'layout-phase',
      name: 'Cut',
      startDate: daysAgo(20),
      endDate: null,
      color: '#3b82f6',
      createdAt,
    },
  ],
  profile: {
    startWeightKg: 80,
    goalWeightKg: 75,
    heightCm: 180,
    unit: 'kg',
    chartWindowDays: 90,
  },
  version: 1,
})

function check(id, name, ok, details) {
  const result = { id, name, ok: Boolean(ok), details }
  results.push(result)
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${details === undefined ? '' : ` :: ${JSON.stringify(details).slice(0, 900)}`}`)
}

async function smallControls(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('button, input')]
      .filter((element) => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      })
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const checkboxLabel = element.matches('.checkbox-input') ? element.closest('label') : null
        const labelHeight = checkboxLabel?.getBoundingClientRect().height ?? 0
        return {
          element: element.className || element.getAttribute('aria-label') || element.textContent?.trim() || element.type,
          height: Number(rect.height.toFixed(2)),
          allowedException: Boolean(checkboxLabel && rect.height >= 24 && labelHeight >= 44),
          labelHeight: Number(labelHeight.toFixed(2)),
        }
      })
      .filter((control) => control.height < 44)
  })
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => console.error('PAGEERROR', error.message))
  await page.evaluateOnNewDocument((value) => {
    try {
      localStorage.setItem('weight-tracker:v1', value)
    } catch {
      // The script also runs on the initial about:blank document.
    }
  }, seed)

  for (const [width, height] of VIEWPORTS) {
    for (const theme of THEMES) {
      const prefix = `${width}-${theme}`
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
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
      await page.reload({ waitUntil: 'networkidle0' })
      await sleep(400)

      const layout = await page.evaluate(() => {
        const rectData = (rect) => ({
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        })
        const tiles = [...document.querySelectorAll('.stat-tile')].map((tile) => {
          const rect = tile.getBoundingClientRect()
          const unit = tile.querySelector('.stat-unit')
          const unitRect = unit?.getBoundingClientRect()
          return {
            label: tile.querySelector('.stat-label')?.textContent,
            scrollWidth: tile.scrollWidth,
            clientWidth: tile.clientWidth,
            height: rect.height,
            unitInside: !unitRect || (unitRect.left >= rect.left - 1 && unitRect.right <= rect.right + 1),
          }
        })
        const control = document.querySelector('.segmented-control')
        const options = [...document.querySelectorAll('.segmented-option')]
        const controlRect = control.getBoundingClientRect()
        const lastRect = options.at(-1).getBoundingClientRect()
        const fabRect = document.querySelector('.fab').getBoundingClientRect()
        const shellRect = document.querySelector('.app-shell').getBoundingClientRect()
        const tabRect = document.querySelector('.tab-bar').getBoundingClientRect()
        const tabButtons = [...document.querySelectorAll('.tab-button')].map((button) => rectData(button.getBoundingClientRect()))
        const headlineNumber = document.querySelector('.headline-number').getBoundingClientRect()
        const headlineUnit = document.querySelector('.headline-unit').getBoundingClientRect()
        return {
          tiles,
          segmented: {
            optionCount: options.length,
            control: rectData(controlRect),
            last: rectData(lastRect),
            scrollWidth: control.scrollWidth,
            clientWidth: control.clientWidth,
          },
          fab: rectData(fabRect),
          shell: rectData(shellRect),
          tab: rectData(tabRect),
          tabButtons,
          headlineGap: headlineUnit.left - headlineNumber.right,
        }
      })

      check(
        `${prefix}-stats-overflow`,
        'Stat values and units stay inside every tile',
        layout.tiles.length === 4 && layout.tiles.every((tile) => tile.scrollWidth <= tile.clientWidth + 1 && tile.unitInside),
        layout.tiles,
      )
      const tileHeights = layout.tiles.map((tile) => tile.height)
      check(
        `${prefix}-stats-height`,
        'All four stat tiles have equal height',
        tileHeights.length === 4 && tileHeights.every((value) => Math.abs(value - tileHeights[0]) <= 1),
        tileHeights,
      )
      const { segmented } = layout
      check(
        `${prefix}-segments`,
        'All chart ranges fit and All is fully visible',
        segmented.optionCount === 5 &&
          segmented.last.left >= segmented.control.left - 1 &&
          segmented.last.right <= segmented.control.right + 1 &&
          segmented.scrollWidth <= segmented.clientWidth + 1,
        segmented,
      )
      const fabTabOverlaps = layout.tabButtons.filter(
        (button) =>
          layout.fab.left < button.right &&
          layout.fab.right > button.left &&
          layout.fab.top < button.bottom &&
          layout.fab.bottom > button.top,
      )
      check(`${prefix}-fab-tabs`, 'FAB does not overlap any tab button', fabTabOverlaps.length === 0, {
        fab: layout.fab,
        overlaps: fabTabOverlaps,
      })
      if (width >= 520) {
        check(
          `${prefix}-fab-column`,
          'FAB stays 16px inside the content column',
          layout.fab.left >= layout.shell.left - 1 &&
            layout.fab.right <= layout.shell.right + 1 &&
            Math.abs(layout.shell.right - layout.fab.right - 16) <= 1,
          { fab: layout.fab, shell: layout.shell },
        )
        check(
          `${prefix}-tab-width`,
          'Tab bar is exactly 480px and centered on the column',
          Math.abs(layout.tab.width - 480) <= 1 &&
            Math.abs(layout.tab.left - layout.shell.left) <= 1 &&
            Math.abs(layout.tab.right - layout.shell.right) <= 1,
          { tab: layout.tab, shell: layout.shell },
        )
      }
      check(
        `${prefix}-headline-unit`,
        'Dashboard unit remains adjacent to the number',
        layout.headlineGap >= -1 && layout.headlineGap <= 16,
        { gap: layout.headlineGap },
      )
      const baseSmall = await smallControls(page)
      check(
        `${prefix}-targets-dashboard`,
        'Visible dashboard buttons/inputs are at least 44px tall',
        baseSmall.length === 0,
        baseSmall,
      )

      await page.screenshot({ path: `${OUT}/layout-${prefix}.png`, fullPage: true })

      await page.click('.fab')
      await sleep(300)
      const sheet = await page.evaluate(() => {
        const content = document.querySelector('.sheet-content')
        const note = document.querySelector('input[aria-label="Note"]').getBoundingClientRect()
        const save = document.querySelector('.sheet-actions .button--primary').getBoundingClientRect()
        const value = document.querySelector('.big-number-value').getBoundingClientRect()
        const unit = document.querySelector('.big-number-unit').getBoundingClientRect()
        return {
          save: save.toJSON(),
          saveVisible: save.top >= 0 && save.bottom <= innerHeight,
          note: note.toJSON(),
          content: content.getBoundingClientRect().toJSON(),
          scrollHeight: content.scrollHeight,
          clientHeight: content.clientHeight,
          scrollShadow: getComputedStyle(content).backgroundImage.includes('radial-gradient'),
          unitGap: unit.left - value.right,
        }
      })
      check(
        `${prefix}-sheet-save`,
        'Sheet Save action remains visible and numeric unit stays adjacent',
        sheet.saveVisible && sheet.save.height >= 44 && sheet.unitGap >= -1 && sheet.unitGap <= 16 && sheet.scrollShadow,
        sheet,
      )
      const sheetSmall = await smallControls(page)
      check(
        `${prefix}-targets-log-sheet`,
        'Visible log-sheet buttons/inputs are at least 44px tall',
        sheetSmall.length === 0,
        sheetSmall,
      )
      if (width === 320) {
        await page.screenshot({ path: `${OUT}/layout-${prefix}-sheet.png` })
      }

      await page.click('.big-number-value')
      await page.keyboard.down('Control')
      await page.keyboard.press('KeyA')
      await page.keyboard.up('Control')
      await page.keyboard.type('999')
      await page.click('.sheet-actions .button--primary')
      await sleep(250)
      const toast = await page.evaluate(() => {
        const element = document.querySelector('.toast')
        if (!element) return { visible: false, intersectsFab: true, aboveActions: false, pointerEvents: null }
        const toastRect = element.getBoundingClientRect()
        const fabRect = document.querySelector('.fab').getBoundingClientRect()
        const actions = document.querySelector('.sheet-layer.is-open .sheet-actions')
        const actionsRect = actions?.getBoundingClientRect()
        return {
          visible: !element.hidden && element.classList.contains('is-visible'),
          sheetOpen: Boolean(actions),
          toast: toastRect.toJSON(),
          fab: fabRect.toJSON(),
          actions: actionsRect?.toJSON(),
          intersectsFab:
            toastRect.left < fabRect.right &&
            toastRect.right > fabRect.left &&
            toastRect.top < fabRect.bottom &&
            toastRect.bottom > fabRect.top,
          aboveActions: !actionsRect || toastRect.bottom <= actionsRect.top + 1,
          pointerEvents: getComputedStyle(element).pointerEvents,
        }
      })
      check(
        `${prefix}-toast`,
        'Toast clears the FAB and sheet actions without intercepting taps',
        toast.visible && !toast.intersectsFab && toast.aboveActions && toast.pointerEvents === 'none',
        toast,
      )
      if (width === 320) {
        await page.screenshot({ path: `${OUT}/layout-${prefix}-toast.png` })
      }

      await page.keyboard.press('Escape')
      await sleep(50)
      await page.evaluate(() => document.querySelector('.button--small')?.click())
      await sleep(300)
      const phaseSmall = await smallControls(page)
      check(
        `${prefix}-targets-phase-sheet`,
        'Phase controls meet 44px, except a >=24px checkbox in a >=44px label',
        phaseSmall.every((control) => control.allowedException),
        phaseSmall,
      )
    }
  }

  const emptyPage = await browser.newPage()
  await emptyPage.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true })
  await emptyPage.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  const emptySeed = JSON.stringify({ ...JSON.parse(seed), entries: [] })
  await emptyPage.evaluateOnNewDocument((value) => {
    try {
      localStorage.setItem('weight-tracker:v1', value)
    } catch {
      // Ignore the initial about:blank document.
    }
  }, emptySeed)
  await emptyPage.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
  await emptyPage.reload({ waitUntil: 'networkidle0' })
  await sleep(400)
  const emptyState = await emptyPage.evaluate(() => {
    const chart = document.querySelector('.chart-empty .empty-state')
    const recent = document.querySelector('[aria-label="Recent entries"] .empty-state')
    const chartStyle = getComputedStyle(chart)
    const chartAction = chart.querySelector('.button')
    return {
      chartHeight: chart.getBoundingClientRect().height,
      chartBorder: chartStyle.borderTopWidth,
      chartActionVisible: getComputedStyle(chartAction).display !== 'none',
      recentHeight: recent.getBoundingClientRect().height,
    }
  })
  check(
    'empty-state-chart',
    'Chart no-data message is compact while Recent owns the full empty state',
    emptyState.chartHeight < 100 &&
      emptyState.chartBorder === '0px' &&
      !emptyState.chartActionVisible &&
      emptyState.recentHeight >= 200,
    emptyState,
  )
  await emptyPage.screenshot({ path: `${OUT}/layout-empty-320-light.png`, fullPage: true })
  await emptyPage.close()
} finally {
  await browser.close()
}

const summary = {
  passed: results.filter((result) => result.ok).length,
  failed: results.filter((result) => !result.ok).length,
  total: results.length,
  results,
}
fs.writeFileSync('qa/layout-results.json', JSON.stringify(summary, null, 2))
console.log(`\n==== LAYOUT SUMMARY: ${summary.passed} passed, ${summary.failed} failed (${summary.total} total) ====`)
if (summary.failed > 0) process.exitCode = 1
