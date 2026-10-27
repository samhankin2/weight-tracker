/**
 * Tail regression checks: item 13 (repeatability), phase CRUD, settings/export/import.
 * Fresh browser process to avoid the renderer crash seen in the long run.
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const OUT = 'qa/regression'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = new Date()
const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
const TODAY = daysAgo(0)

const results = []
const consoleIssues = []
let stamp = Date.now()
const entry = (date, weightKg) => ({ date, weightKg, createdAt: stamp++, updatedAt: stamp++ })
const makeSeed = ({ entries = [], phases = [], profile = {} } = {}) => ({
  entries,
  phases,
  profile: { startWeightKg: null, goalWeightKg: null, heightCm: null, unit: 'kg', chartWindowDays: 90, ...profile },
  version: 1,
})
const seriesEntries = (count, { startKg = 82, step = -0.2, endOffset = 0 } = {}) =>
  Array.from({ length: count }, (_, i) => {
    const offset = endOffset + (count - 1 - i)
    return entry(daysAgo(offset), Math.round((startKg + i * step) * 10) / 10)
  })
function check(id, name, ok, details) {
  results.push({ id, name, ok: Boolean(ok), details })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name} :: ${JSON.stringify(details).slice(0, 1600)}`)
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

async function openApp({ seed, width = 360, height = 740, theme = 'light', label = 'tail' }) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleIssues.push({ label, type: msg.type(), text: msg.text() })
    }
  })
  page.on('pageerror', (e) => consoleIssues.push({ label, type: 'pageerror', text: e.message }))
  await page.setViewport({ width, height, isMobile: width < 520, hasTouch: true, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  await page.evaluateOnNewDocument((value) => {
    try {
      localStorage.setItem('weight-tracker:v1', value)
    } catch {
      /* about:blank */
    }
  }, JSON.stringify(seed))
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(700)
  return { context, page }
}

async function laterPage(context) {
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleIssues.push({ label: 'later', type: msg.type(), text: msg.text() })
    }
  })
  await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true })
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await sleep(700)
  return page
}

const readState = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('weight-tracker:v1') || 'null')
    } catch {
      return null
    }
  })
const readToast = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.toast')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      text: el.textContent.trim(),
      tone: el.dataset.tone,
      visible: !el.hidden && el.classList.contains('is-visible'),
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
    }
  })

try {
  const mainSeed = makeSeed({
    entries: seriesEntries(40, { startKg: 82, step: -0.2 }),
    phases: [
      { id: 'phase-bulk', name: 'Bulk', startDate: daysAgo(14), endDate: null, color: '#f59e0b', createdAt: stamp++ },
    ],
    profile: { startWeightKg: 80, goalWeightKg: 75, heightCm: 180 },
  })

  // ---- 13. Toast vs FAB, repeated with realistic typing -----------------
  const toastRun = await openApp({ seed: mainSeed, label: 'toast-13' })
  const p = toastRun.page
  const attempts = []
  for (let attempt = 1; attempt <= 3; attempt++) {
    await p.click('.fab')
    await sleep(450)
    const opened = await p.evaluate(() => ({
      open: Boolean(document.querySelector('.sheet-layer.is-open')),
      title: document.querySelector('.sheet-title')?.textContent,
      value: document.querySelector('.big-number-value')?.value,
      active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className,
    }))
    // Real user interaction: tap the field (focus selects all), then type.
    await p.click('.big-number-value')
    await sleep(220)
    const focusState = await p.evaluate(() => ({
      activeClass: document.activeElement?.className,
      selection: [document.activeElement?.selectionStart, document.activeElement?.selectionEnd],
      value: document.querySelector('.big-number-value')?.value,
    }))
    await p.keyboard.type('0.5', { delay: 40 })
    await sleep(150)
    const typedValue = await p.evaluate(() => document.querySelector('.big-number-value')?.value)
    await p.click('.sheet-actions .button--primary')
    await sleep(450)
    const toast = await readToast(p)
    const fab = await p.evaluate(() => {
      const r = document.querySelector('.fab').getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    })
    const intersects =
      toast && toast.rect.left < fab.right && toast.rect.right > fab.left && toast.rect.top < fab.bottom && toast.rect.bottom > fab.top
    const sheetOpen = await p.evaluate(() => Boolean(document.querySelector('.sheet-layer.is-open')))
    const state = await readState(p)
    attempts.push({
      attempt,
      opened,
      focusState,
      typedValue,
      toast,
      sheetOpen,
      intersectsFab: Boolean(intersects),
      returnedToFab: await p.evaluate(
        () => document.activeElement === document.querySelector('.fab') || !document.querySelector('.sheet-layer.is-open'),
      ),
      entries: state?.entries?.length,
      todayWeight: state?.entries?.find((e) => e.date === TODAY)?.weightKg,
    })
    // Close/reset for the next attempt.
    if (sheetOpen) {
      await p.keyboard.press('Escape')
      await sleep(400)
    }
  }
  const last = attempts.at(-1)
  check(
    '13-toast-clears-fab',
    'Plausibility error toast does not intersect the FAB (3 attempts)',
    attempts.every(
      (a) =>
        a.open &&
        a.typedValue === '0.5' &&
        a.toast?.tone === 'error' &&
        a.toast?.visible &&
        !a.intersectsFab &&
        a.sheetOpen &&
        a.entries === 40,
    ),
    attempts,
  )
  check(
    '13b-toast-repeatable-focus',
    'Field receives focus/selection reliably on repeated sheet opens',
    attempts.every((a) => a.focusState.activeClass === 'big-number-value'),
    attempts.map((a) => ({ focus: a.focusState, typed: a.typedValue, toastTone: a.toast?.tone })),
  )
  await toastRun.context.close()

  // ---- B. phase CRUD ----------------------------------------------------
  {
    const run = await openApp({ seed: makeSeed({ entries: seriesEntries(20) }), label: 'phase-crud' })
    const q = run.page
    const baselineLength = await q.evaluate(() => document.querySelector('#weight-chart').toDataURL().length)
    const emptyLegend = await q.evaluate(() => document.querySelector('.phase-legend__empty')?.textContent)
    await q.evaluate(() => document.querySelector('section[aria-label="Training phases"] button.button--small').click())
    await sleep(450)
    const newSheet = await q.evaluate(() => ({
      title: document.querySelector('.sheet-title')?.textContent,
      ongoing: document.querySelector('.checkbox-input')?.checked,
    }))
    await q.click('input[aria-label="Phase name"]')
    await q.keyboard.type('Bulk')
    await q.evaluate((value) => {
      const input = document.querySelector('input[aria-label="Phase start date"]')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, value)
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, daysAgo(14))
    await sleep(150)
    await q.click('.sheet-actions .button--primary')
    await sleep(700)
    const afterCreate = await q.evaluate(() => ({
      names: [...document.querySelectorAll('.phase-legend__name')].map((n) => n.textContent),
      ranges: [...document.querySelectorAll('.phase-legend__range')].map((n) => n.textContent),
      chartLength: document.querySelector('#weight-chart').toDataURL().length,
    }))
    const createdState = await readState(q)

    await q.click('button[aria-label="Edit Bulk phase"]')
    await sleep(450)
    await q.click('input[aria-label="Phase name"]')
    await q.keyboard.down('Control')
    await q.keyboard.press('KeyA')
    await q.keyboard.up('Control')
    await q.keyboard.type('Cut')
    await q.click('.sheet-actions .button--primary')
    await sleep(700)
    const afterEdit = await q.evaluate(() => ({
      names: [...document.querySelectorAll('.phase-legend__name')].map((n) => n.textContent),
      stored: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').phases?.map((x) => x.name),
      chartLength: document.querySelector('#weight-chart').toDataURL().length,
    }))

    await q.click('button[aria-label="Delete Cut phase"]')
    await sleep(450)
    const confirmTitle = await q.evaluate(() => document.querySelector('.sheet-layer.is-open .sheet-title')?.textContent)
    await q.evaluate(() => {
      const btn = [...document.querySelectorAll('.sheet-layer.is-open .sheet-actions button')].find((b) =>
        b.textContent.includes('Delete phase'),
      )
      btn.click()
    })
    await sleep(800)
    const afterDelete = await q.evaluate(() => ({
      names: [...document.querySelectorAll('.phase-legend__name')].map((n) => n.textContent),
      empty: document.querySelector('.phase-legend__empty')?.textContent,
      chartLength: document.querySelector('#weight-chart').toDataURL().length,
      stored: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').phases?.length,
    }))
    check(
      'sweep-phase-crud',
      'Create/edit/delete phase updates legend and chart shading',
      emptyLegend === 'No phases yet' &&
        newSheet.title === 'New phase' &&
        newSheet.ongoing === true &&
        afterCreate.names.join(',') === 'Bulk' &&
        /ongoing/.test(afterCreate.ranges[0] ?? '') &&
        createdState?.phases?.length === 1 &&
        afterCreate.chartLength !== baselineLength &&
        afterEdit.names.join(',') === 'Cut' &&
        afterEdit.stored?.join(',') === 'Cut' &&
        afterEdit.chartLength === afterCreate.chartLength &&
        confirmTitle?.includes('Cut') &&
        afterDelete.names.length === 0 &&
        afterDelete.empty === 'No phases yet' &&
        afterDelete.stored === 0 &&
        afterDelete.chartLength !== afterEdit.chartLength,
      {
        baselineLength,
        emptyLegend,
        newSheet,
        afterCreate,
        createdState: createdState?.phases?.length,
        afterEdit,
        confirmTitle,
        afterDelete,
        chartRestoredToBaseline: afterDelete.chartLength === baselineLength,
      },
    )
    await run.context.close()
  }

  // ---- C. settings persist + D. export/import --------------------------
  {
    const run = await openApp({
      seed: makeSeed({
        entries: seriesEntries(5, { startKg: 82, step: -0.3 }),
        phases: [{ id: 'ph-export', name: 'Bulk', startDate: daysAgo(10), endDate: null, color: '#f59e0b', createdAt: stamp++ }],
        profile: {},
      }),
      label: 'settings-export',
    })
    const q = run.page
    await q.click('.tab-button[data-tab="settings"]')
    await sleep(450)
    for (const [label, value] of [
      ['Starting weight in kilograms', '82'],
      ['Goal weight in kilograms', '75'],
      ['Height in centimetres', '180'],
    ]) {
      await q.evaluate(
        ({ label, value }) => {
          const input = document.querySelector(`input[aria-label="${label}"]`)
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, value)
          input.dispatchEvent(new Event('change', { bubbles: true }))
        },
        { label, value },
      )
      await sleep(400)
    }
    const savedProfile = (await readState(q))?.profile

    const q2 = await laterPage(run.context)
    await q2.click('.tab-button[data-tab="settings"]')
    await sleep(450)
    const reloaded = await q2.evaluate(() => ({
      start: document.querySelector('input[aria-label="Starting weight in kilograms"]')?.value,
      goal: document.querySelector('input[aria-label="Goal weight in kilograms"]')?.value,
      height: document.querySelector('input[aria-label="Height in centimetres"]')?.value,
      stored: JSON.parse(localStorage.getItem('weight-tracker:v1') || '{}').profile,
    }))
    check(
      'sweep-settings-persist',
      'Start weight, goal, height persist across reload',
      savedProfile?.startWeightKg === 82 &&
        savedProfile?.goalWeightKg === 75 &&
        savedProfile?.heightCm === 180 &&
        reloaded.start === '82' &&
        reloaded.goal === '75' &&
        reloaded.height === '180' &&
        reloaded.stored?.heightCm === 180,
      { savedProfile, reloaded },
    )

    const beforeExport = await readState(q2)
    const downloads = path.join(process.env.USERPROFILE || '', 'Downloads')
    const started = Date.now()
    await q2.evaluate(() => {
      const button = [...document.querySelectorAll('.view--settings button')].find((b) => b.textContent.includes('Export data'))
      button.click()
    })
    let exportedFile = null
    for (let i = 0; i < 60; i++) {
      const files = fs.existsSync(downloads)
        ? fs.readdirSync(downloads).filter((f) => /^weight-backup-.*\.json$/.test(f))
        : []
      for (const f of files) {
        const full = path.join(downloads, f)
        if (fs.statSync(full).mtimeMs >= started - 1000) exportedFile = full
      }
      if (exportedFile) break
      await sleep(200)
    }
    let exported = null
    if (exportedFile) {
      for (let i = 0; i < 40; i++) {
        try {
          exported = JSON.parse(fs.readFileSync(exportedFile, 'utf8'))
          break
        } catch {
          await sleep(150)
        }
      }
    }
    const exportToast = await readToast(q2)

    // Reset everything, then import.
    await q2.evaluate(() => {
      const btn = [...document.querySelectorAll('.view--settings .button--danger')].find((b) => b.textContent.includes('Delete all data'))
      btn.click()
    })
    await sleep(450)
    await q2.evaluate(() => {
      const btn = [...document.querySelectorAll('.sheet-layer.is-open .sheet-actions button')].find((b) =>
        b.textContent.includes('Delete everything'),
      )
      btn.click()
    })
    await sleep(600)
    const afterReset = await readState(q2)
    const fileInput = await q2.$('input[type="file"]')
    let uploadError = null
    if (exportedFile && fileInput) {
      try {
        await fileInput.uploadFile(exportedFile)
      } catch (e) {
        uploadError = String(e)
      }
    }
    await sleep(1200)
    const afterImport = await readState(q2)
    const importToast = await readToast(q2)
    check(
      'sweep-export-import',
      'Export produces a valid JSON file and import restores entries/phases/profile',
      exported !== null &&
        exported.entries?.length === beforeExport?.entries?.length &&
        exported.phases?.length === beforeExport?.phases?.length &&
        afterReset?.entries?.length === 0 &&
        afterReset?.phases?.length === 0 &&
        afterImport?.entries?.length === beforeExport?.entries?.length &&
        afterImport?.phases?.length === beforeExport?.phases?.length &&
        afterImport?.profile?.heightCm === 180 &&
        /Backup restored/.test(importToast?.text ?? ''),
      {
        exportedFile,
        exportToast,
        exported: exported
          ? { entries: exported.entries?.length, phases: exported.phases?.length, profile: exported.profile }
          : null,
        beforeExport: { entries: beforeExport?.entries?.length, phases: beforeExport?.phases?.length },
        afterReset: { entries: afterReset?.entries?.length, phases: afterReset?.phases?.length },
        afterImport: { entries: afterImport?.entries?.length, phases: afterImport?.phases?.length, profile: afterImport?.profile },
        importToast,
        uploadError,
      },
    )
    await run.context.close()
  }
} finally {
  await browser.close()
}

const summary = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  total: results.length,
  results,
  consoleIssues,
}
fs.writeFileSync(path.join(OUT, 'tail-results.json'), JSON.stringify(summary, null, 2))
console.log(`\n==== TAIL SUMMARY: ${summary.passed} passed, ${summary.failed} failed (${summary.total} total) ====`)
if (summary.failed > 0) process.exitCode = 1
