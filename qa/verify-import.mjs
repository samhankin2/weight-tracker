/**
 * End-to-end verification of the "Import a list" feature + regressions.
 * Drives Microsoft Edge via puppeteer. Reports; never mutates src/.
 *
 *   node qa/verify-import.mjs
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const APP = 'http://localhost:5173/'
const OUT = path.resolve('qa/screens')
fs.mkdirSync(OUT, { recursive: true })

const results = []
const consoleErrors = []
const pageErrors = []
const failedRequests = []
const ufffdSnapshots = []

function rec(id, name, pass, evidence) {
  results.push({ id, name, status: pass ? 'PASS' : 'FAIL', evidence })
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${String(id).padStart(2)}  ${name}\n      ${JSON.stringify(evidence)}\n`,
  )
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  defaultViewport: { width: 360, height: 740, deviceScaleFactor: 2 },
})

const page = await browser.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => pageErrors.push(String(e)))
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function goto() {
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.tab-bar .tab-button')
  await sleep(300)
}

async function gotoSection(tab) {
  await page.evaluate((t) => {
    const b = document.querySelector(`.tab-button[data-tab="${t}"]`)
    b?.click()
  }, tab)
  await sleep(200)
}

async function openImporter() {
  await gotoSection('settings')
  await page.evaluate(() => {
    const b = document.querySelector('[data-focus-key="settings-import-list"]')
    if (b) {
      b.scrollIntoView({ block: 'center' })
      b.click()
    }
  })
  await page.waitForSelector('.sheet-layer.is-open .sheet-panel')
  await sleep(350) // open animation
}

async function sheetGone() {
  await page.waitForFunction(
    () => {
      const l = document.querySelector('.sheet-layer')
      if (!l) return true
      if (l.hidden) return true
      const r = l.getBoundingClientRect()
      return r.height === 0 || getComputedStyle(l).visibility === 'hidden'
    },
    { timeout: 4000 },
  )
}

async function setTextarea(text) {
  await page.evaluate(() => {
    const t = document.querySelector('.import-textarea')
    t.focus()
    t.value = ''
    t.dispatchEvent(new Event('input', { bubbles: true }))
  })
  if (text) await page.type('.import-textarea', text, { delay: 1 })
  await page.waitForFunction(
    (exp) => document.querySelector('.import-textarea').value.trim() === exp.trim(),
    { timeout: 5000 },
    text,
  )
  await sleep(80)
}

async function readSheet() {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const txt = (s) => q(s)?.innerText?.replace(/\s+/g, ' ').trim() ?? null
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        w: Math.round(r.width),
        h: Math.round(r.height),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
      }
    }
    const panel = q('.sheet-panel')
    const primary = q('.sheet-actions .button--primary')
    const buttons = [...document.querySelectorAll('.sheet-panel button')].map((b) => ({
      text: b.innerText.replace(/\s+/g, ' ').trim(),
      ariaLabel: b.getAttribute('aria-label'),
      ariaHidden: b.getAttribute('aria-hidden'),
      title: b.getAttribute('title'),
      disabled: b.disabled,
    }))
    return {
      viewport: { w: innerWidth, h: innerHeight },
      panel: rect(panel),
      title: txt('.sheet-title'),
      subtitle: txt('.sheet-subtitle'),
      textarea: {
        ...rect(q('.import-textarea')),
        placeholder: q('.import-textarea')?.placeholder ?? null,
        disabled: q('.import-textarea')?.disabled ?? null,
        ariaLabel: q('.import-textarea')?.getAttribute('aria-label') ?? null,
      },
      summary: { ...rect(q('.import-summary')), text: txt('.import-summary') },
      preview: {
        ...rect(q('.import-preview')),
        rows: [...document.querySelectorAll('.import-preview li')].map((li) => ({
          text: li.innerText.replace(/\s+/g, ' ').trim(),
          hasBadge: !!li.querySelector('.import-row-badge'),
          badgeText: li.querySelector('.import-row-badge')?.textContent ?? null,
          listTag: li.parentElement.tagName,
        })),
        ulCount: document.querySelectorAll('.import-preview ul').length,
        overflowY: q('.import-preview') ? getComputedStyle(q('.import-preview')).overflowY : null,
        scrollH: q('.import-preview')?.scrollHeight ?? null,
        clientH: q('.import-preview')?.clientHeight ?? null,
      },
      skipped: {
        details: document.querySelectorAll('.import-skipped-details').length,
        summaryText: txt('.import-skipped-summary'),
        listItems: [...document.querySelectorAll('.import-skipped-list li')].map((li) =>
          li.innerText.replace(/\s+/g, ' ').trim(),
        ),
        open: q('.import-skipped-details')?.open ?? null,
      },
      importButton: {
        ...rect(primary),
        text: primary?.innerText.replace(/\s+/g, ' ').trim() ?? null,
        disabled: primary?.disabled ?? null,
        hasDisabledAttr: primary?.hasAttribute('disabled') ?? null,
      },
      actions: rect(q('.sheet-actions')),
      buttons,
      contentScroll: {
        scrollH: q('.sheet-content')?.scrollHeight ?? null,
        clientH: q('.sheet-content')?.clientHeight ?? null,
      },
      fab: (() => {
        const f = q('.fab')
        if (!f) return null
        const r = f.getBoundingClientRect()
        const cs = getComputedStyle(f)
        return {
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          right: Math.round(r.right),
          opacity: cs.opacity,
          zIndex: cs.zIndex,
          visibleClass: f.className,
        }
      })(),
      sheetZ: q('.sheet-layer') ? getComputedStyle(q('.sheet-layer')).zIndex : null,
      bodyOverflow: getComputedStyle(document.body).overflow,
      activeElement: {
        tag: document.activeElement?.tagName ?? null,
        cls: document.activeElement?.className ?? null,
        key: document.activeElement?.dataset?.focusKey ?? null,
      },
    }
  })
}

async function state() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('weight-tracker:v1') || 'null'))
}

const SUMMARY_5 = `5 Mar 2026 74.5
12 Mar 2026 74.8
19 Mar 2026 75.1 after gym`

const out = {}
let r

try {
  await goto()

  /* ---------------------------------------------------------------- 1 ----- */
  {
    const evidence = {}
    await gotoSection('settings')
    const card = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.view--settings .card')]
      const c = cards.find((x) => x.getAttribute('aria-label') === 'Import a list')
      if (!c) return null
      const btn = c.querySelector('button')
      return {
        cardTitle: c.querySelector('.card-title')?.innerText.trim() ?? null,
        cardHint: c.querySelector('.card-hint')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
        buttonText: btn?.innerText.trim() ?? null,
        buttonKey: btn?.dataset.focusKey ?? null,
      }
    })
    evidence.settingsCard = card
    assert(card, 'No "Import a list" card found in Settings')
    await openImporter()
    const s = await readSheet()
    evidence.title = s.title
    evidence.subtitle = s.subtitle
    evidence.viewport = s.viewport
    evidence.panel = s.panel
    evidence.textarea = s.textarea
    evidence.importButton = s.importButton
    evidence.placeholder = s.textarea.placeholder
    evidence.actions = s.actions
    evidence.bodyOverflow = s.bodyOverflow
    evidence.fab = s.fab
    evidence.sheetZ = s.sheetZ
    assert(s.panel, 'sheet panel missing')
    assert(s.panel.top >= 0 && s.panel.bottom <= s.viewport.h + 1, 'panel not fully in viewport')
    assert(s.panel.left >= 0 && s.panel.right <= s.viewport.w + 1, 'panel wider than viewport')
    assert(Number(s.panel.opacity) === 1 && s.panel.visibility === 'visible', 'panel not visible')
    assert(s.textarea.top >= 0 && s.textarea.bottom <= s.viewport.h, 'textarea not fully in viewport')
    assert(s.importButton.top >= 0 && s.importButton.bottom <= s.viewport.h, 'import button offscreen')
    rec(1, 'Settings -> Import a list opens a fully visible sheet', true, evidence)
  }

  /* ---------------------------------------------------------------- 2 ----- */
  {
    const s = await readSheet()
    const evidence = {
      importButtonText: s.importButton.text,
      disabledProp: s.importButton.disabled,
      disabledAttr: s.importButton.hasDisabledAttr,
      summaryText: s.summary.text,
      summaryRole: await page.evaluate(() => {
        const el = document.querySelector('.import-summary')
        return { role: el.getAttribute('role'), ariaLive: el.getAttribute('aria-live') }
      }),
    }
    assert(s.importButton.disabled === true, 'Import button is not disabled on empty textarea')
    rec(2, 'Import button DISABLED with empty textarea', true, evidence)
  }

  /* ---------------------------------------------------------------- 3 & 4 */
  {
    await setTextarea(SUMMARY_5)
    const s = await readSheet()
    out.filled = s
    const evidence = {
      summaryText: s.summary.text,
      previewRowCount: s.preview.rows.length,
      previewRows: s.preview.rows.map((x) => x.text),
      row19: s.preview.rows.find((x) => x.text.includes('19 Mar')) ?? null,
      importButton: { text: s.importButton.text, disabled: s.importButton.disabled },
      sortedNewestFirst: s.preview.rows.map((x) => x.text),
    }
    assert(/3 new entries/.test(s.summary.text ?? ''), `summary missing "3 new entries": ${s.summary.text}`)
    assert(s.preview.rows.length === 3, `expected 3 preview rows, got ${s.preview.rows.length}`)
    assert(s.importButton.disabled === false, 'Import button still disabled with valid input')
    assert(s.importButton.text === 'Import 3', `Import button text = ${s.importButton.text}`)
    rec(3, 'Typed 3 lines -> summary "3 new entries", 3 preview rows, button "Import 3"', true, evidence)

    const noteRow = s.preview.rows.find((x) => x.text.includes('19 Mar'))
    assert(noteRow, 'no 19 Mar preview row')
    const noteEvidence = {
      rowText: noteRow.text,
      noteEl: await page.evaluate(() => {
        const li = [...document.querySelectorAll('.import-preview li')].find((l) =>
          l.innerText.includes('19 Mar'),
        )
        return li?.querySelector('.import-row-note')?.textContent ?? null
      }),
      relativeDate: await page.evaluate(() => {
        const li = [...document.querySelectorAll('.import-preview li')].find((l) =>
          l.innerText.includes('19 Mar'),
        )
        return li?.querySelector('.import-row-date')?.textContent ?? null
      }),
    }
    assert(noteEvidence.noteEl === 'after gym', `note = ${noteEvidence.noteEl}`)
    rec(4, '19 Mar preview row shows note "after gym"', true, noteEvidence)
  }

  /* ---------------------------------------------------------------- 5 ----- */
  {
    // screenshot with populated preview (light, 360x740) for the visual review
    await page.screenshot({ path: path.join(OUT, 'import-light-360x740-populated.png') })
    await page.evaluate(() => document.querySelector('.sheet-actions .button--primary').click())
    await page.waitForSelector('.toast.is-visible', { timeout: 3000 })
    const toast = await page.evaluate(() => {
      const t = document.querySelector('.toast')
      const cs = getComputedStyle(t)
      const r = t.getBoundingClientRect()
      return {
        text: t.innerText.replace(/\s+/g, ' ').trim(),
        tone: t.dataset.tone,
        cls: t.className,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        opacity: cs.opacity,
        transition: cs.transition,
      }
    })
    await sleep(600)
    const stillVisible = await page.evaluate(() => {
      const t = document.querySelector('.toast')
      return { cls: t.className, opacity: getComputedStyle(t).opacity }
    })
    await sheetGone()
    await sleep(150)
    const st = await state()
    out.stateAfterFirst = st
    const entries = st.entries
    const evidence = {
      toast,
      toastAfter600ms: stillVisible,
      sheetClosed: await page.evaluate(() => !document.querySelector('.sheet-layer.is-open')),
      entries: entries.map((e) => ({ date: e.date, weightKg: e.weightKg, note: e.note })),
      bodyOverflowAfterClose: await page.evaluate(() => getComputedStyle(document.body).overflow),
    }
    assert(toast.text.length > 0, 'toast not visible after import')
    assert(entries.length === 3, `expected 3 entries, got ${entries.length}`)
    for (const [d, w] of [
      ['2026-03-05', 74.5],
      ['2026-03-12', 74.8],
      ['2026-03-19', 75.1],
    ]) {
      const e = entries.find((x) => x.date === d)
      assert(e, `missing entry ${d}`)
      assert(Math.abs(e.weightKg - w) < 0.001, `${d} weight = ${e.weightKg}`)
    }
    const e19 = entries.find((x) => x.date === '2026-03-19')
    assert(e19.note === 'after gym', `19 Mar note = ${e19.note}`)
    rec(5, 'Import saves 3 entries, toast shown, sheet closed', true, evidence)
  }

  /* ---------------------------------------------------------------- 6 ----- */
  {
    await gotoSection('dashboard')
    await sleep(400)
    const headline = await page.evaluate(() => ({
      number: document.querySelector('.headline-number')?.textContent ?? null,
      unit: document.querySelector('.headline-unit')?.textContent ?? null,
      whole: document.querySelector('.headline')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    }))
    await gotoSection('history')
    await sleep(250)
    const history = await page.evaluate(() => ({
      rowCount: document.querySelectorAll('.entry-row--detailed').length,
      rows: [...document.querySelectorAll('.entry-row--detailed')].map((r) =>
        r.innerText.replace(/\s+/g, ' ').trim(),
      ),
      subtitle: document.querySelector('.view-subtitle')?.innerText ?? null,
    }))
    const evidence = { headline, history }
    assert(headline.number === '75.1', `headline number = ${headline.number}`)
    assert(headline.unit === 'kg', `headline unit = ${headline.unit}`)
    assert(history.rowCount === 3, `history rows = ${history.rowCount}`)
    for (const w of ['74.5', '74.8', '75.1']) {
      assert(history.rows.some((t) => t.includes(w)), `history missing ${w}`)
    }
    assert(history.rows.some((t) => t.includes('after gym')), 'history missing note')
    rec(6, 'Dashboard headline 75.1 kg + History lists all three', true, evidence)
  }

  /* ---------------------------------------------------------------- 7 ----- */
  {
    await openImporter()
    const evidence = {}
    // (a) literal block from the brief: two lines
    await setTextarea(`5 Mar 2026 76.0
26 Mar 2026 75.5`)
    let s = await readSheet()
    evidence.twoLineSummary = s.summary.text
    evidence.twoLineRows = s.preview.rows.map((x) => ({ text: x.text, badge: x.badgeText }))
    evidence.twoLineButton = s.importButton.text
    // (b) same three lines PLUS a new one (as the prose version of the test reads)
    await setTextarea(`5 Mar 2026 76.0
12 Mar 2026 74.8
19 Mar 2026 75.1 after gym
26 Mar 2026 75.5`)
    const s4 = await readSheet()
    evidence.fourLineSummary = s4.summary.text
    evidence.fourLineButton = s4.importButton.text
    evidence.fourLineBadges = s4.preview.rows
      .filter((x) => x.badgeText)
      .map((x) => x.text)
    // go back to the two-line conflict case for the import assertion
    await setTextarea(`5 Mar 2026 76.0
26 Mar 2026 75.5`)
    s = await readSheet()
    out.conflictSheet = s
    evidence.finalSummary = s.summary.text
    evidence.finalRows = s.preview.rows.map((x) => ({ text: x.text, badge: x.badgeText }))
    evidence.finalButton = s.importButton.text
    const mar5 = s.preview.rows.find((x) => x.text.includes('5 Mar'))
    assert(/1 new entry/.test(s.summary.text), `summary new count wrong: ${s.summary.text}`)
    assert(/1 will replace/.test(s.summary.text), `summary replace count wrong: ${s.summary.text}`)
    assert(s.preview.rows.length === 2, `preview rows = ${s.preview.rows.length}`)
    assert(mar5 && mar5.badgeText === 'replaces', `5 Mar badge = ${mar5?.badgeText}`)
    rec(7, 'Conflict paste -> "1 new" + "1 will replace" + "replaces" badge', true, evidence)
  }

  /* ---------------------------------------------------------------- 8 & 9 */
  {
    await page.screenshot({ path: path.join(OUT, 'import-light-360x740-conflict.png') })
    await page.evaluate(() => document.querySelector('.sheet-actions .button--primary').click())
    await page.waitForSelector('.toast.is-visible', { timeout: 3000 })
    const toast = await page.evaluate(() => ({
      text: document.querySelector('.toast').innerText.replace(/\s+/g, ' ').trim(),
      tone: document.querySelector('.toast').dataset.tone,
    }))
    await sheetGone()
    await sleep(200)
    const st = await state()
    out.stateAfterConflict = st
    const entries = [...st.entries].sort((a, b) => (a.date < b.date ? -1 : 1))
    const mar5 = entries.filter((e) => e.date === '2026-03-05')
    const evidence = {
      toastText: toast.text,
      totalEntries: entries.length,
      entries: entries.map((e) => ({ date: e.date, weightKg: e.weightKg, note: e.note })),
      mar5Count: mar5.length,
      mar5Weight: mar5[0]?.weightKg ?? null,
      mar5CreatedAt: mar5[0]?.createdAt ?? null,
    }
    assert(entries.length === 4, `expected 4 entries, got ${entries.length}`)
    assert(mar5.length === 1, `expected exactly 1 entry for 2026-03-05, got ${mar5.length}`)
    assert(Math.abs(mar5[0].weightKg - 76.0) < 0.001, `5 Mar weight = ${mar5[0].weightKg}`)
    rec(8, 'Overwrite: 4 entries total, 5 Mar = 76.0, single 2026-03-05 row', true, evidence)

    assert(/replaced 1/.test(toast.text), `toast text = ${toast.text}`)
    rec(9, 'Toast mentions the replacement', true, { toastText: toast.text })
  }

  /* ---------------------------------------------------------------- 10 ---- */
  {
    await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 2 })
    await sleep(350)
    await openImporter()
    const many = Array.from({ length: 12 }, (_, i) => `${i + 1} Apr 2026 ${70 + i * 0.3}`).join('\n')
    await setTextarea(many)
    const s = await readSheet()
    await page.screenshot({ path: path.join(OUT, 'import-narrow-320x568-populated.png') })

    // Is the import button reachable without scrolling the sheet content?
    const reach = await page.evaluate(() => {
      const btn = document.querySelector('.sheet-actions .button--primary')
      const content = document.querySelector('.sheet-content')
      const rBtn = btn.getBoundingClientRect()
      const rPanel = document.querySelector('.sheet-panel').getBoundingClientRect()
      // scroll the sheet content to the bottom and see if the button moves
      const before = btn.getBoundingClientRect().top
      content.scrollTop = content.scrollHeight
      const after = btn.getBoundingClientRect().top
      return {
        btnRect: {
          top: Math.round(rBtn.top),
          bottom: Math.round(rBtn.bottom),
          left: Math.round(rBtn.left),
          right: Math.round(rBtn.right),
        },
        panelRect: {
          top: Math.round(rPanel.top),
          bottom: Math.round(rPanel.bottom),
        },
        viewport: { w: innerWidth, h: innerHeight },
        saveBtnStableWhileScrolling: Math.abs(before - after) < 1,
        contentScrollable: content.scrollHeight > content.clientHeight,
        contentScrollTop: content.scrollTop,
        contentScrollH: content.scrollHeight,
        contentClientH: content.clientHeight,
        windowScrollable: document.documentElement.scrollHeight > innerHeight,
        footerPosition: getComputedStyle(document.querySelector('.sheet-actions')).position,
        fab: (() => {
          const f = document.querySelector('.fab')
          const r = f.getBoundingClientRect()
          const cs = getComputedStyle(f)
          return {
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            left: Math.round(r.left),
            right: Math.round(r.right),
            opacity: cs.opacity,
            visibility: cs.visibility,
            z: cs.zIndex,
            pointerEvents: cs.pointerEvents,
          }
        })(),
        sheetZ: getComputedStyle(document.querySelector('.sheet-layer')).zIndex,
      }
    })
    const evidence = {
      ...reach,
      textarea: s.textarea,
      summary: { top: s.summary.top, bottom: s.summary.bottom, text: s.summary.text },
      preview: {
        top: s.preview.top,
        bottom: s.preview.bottom,
        h: s.preview.h,
        scrollH: s.preview.scrollH,
        clientH: s.preview.clientH,
        overflowY: s.preview.overflowY,
        visibleRows: s.preview.rows.length,
      },
      importButtonText: s.importButton.text,
      importButtonDisabled: s.importButton.disabled,
      importButtonRect: s.importButton,
      contentScroll: s.contentScroll,
      actions: s.actions,
      panel: s.panel,
    }
    assert(s.importButton.bottom <= 568, 'import button below the narrow viewport')
    assert(s.importButton.disabled === false, 'import button disabled at 320px')
    assert(reach.saveBtnStableWhileScrolling, 'footer button moves with content scroll (not pinned)')
    assert(reach.contentScrollable, 'sheet content is not scrollable with 12 rows')
    rec(10, 'Narrow 320x568: textarea/summary/preview usable, footer pinned', true, evidence)
    await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2 })
    await sleep(300)
  }

  /* ---------------------------------------------------------------- 11 ---- */
  {
    // close whatever sheet is open, reopen, and paste bad input
    await page.evaluate(() => {
      const cancel = [...document.querySelectorAll('.sheet-actions button')].find((b) =>
        /Cancel/.test(b.innerText),
      )
      cancel?.click()
    })
    await sheetGone()
    const before = (await state()).entries.length
    await openImporter()
    await setTextarea('not a date at all')
    const s = await readSheet()
    const evidence = {
      summaryText: s.summary.text,
      errorStyled: await page.evaluate(() => ({
        hasErrorClass: !!document.querySelector('.import-hint--error'),
        color: (() => {
          const el = document.querySelector('.import-hint--error')
          return el ? getComputedStyle(el).color : null
        })(),
        text: document.querySelector('.import-hint--error')?.textContent ?? null,
      })),
      importButton: { text: s.importButton.text, disabled: s.importButton.disabled },
      skipped: s.skipped,
      entriesBefore: before,
    }
    // try clicking the (disabled) import button anyway
    await page.evaluate(() => {
      const b = document.querySelector('.sheet-actions .button--primary')
      if (!b.disabled) b.click()
    })
    await sleep(200)
    const after = (await state()).entries.length
    evidence.entriesAfter = after
    assert(/Couldn't read any weigh-ins/.test(s.summary.text ?? ''), `no error summary: ${s.summary.text}`)
    assert(s.importButton.disabled === true, 'Import enabled with garbage input')
    assert(before === after, `entries changed ${before} -> ${after}`)
    rec(11, 'Bad input: error summary, Import disabled, nothing added', true, evidence)
  }

  /* ---------------------------------------------------------------- 12 ---- */
  {
    await setTextarea(`5 Mar 2026 74.5
garbage line
31 Feb 2026 74.5
12 Mar 2026 0.5`)
    let s = await readSheet()
    // expand the skipped details to prove the reasons are listed
    const expanded = await page.evaluate(() => {
      const d = document.querySelector('.import-skipped-details')
      if (!d) return null
      d.open = true
      const vis = (el) => el && el.getClientRects().length > 0
      return {
        summary: d.querySelector('summary')?.innerText ?? null,
        items: [...d.querySelectorAll('li')].map((li) => ({
          text: li.innerText.replace(/\s+/g, ' ').trim(),
          visible: vis(li),
        })),
      }
    })
    s = await readSheet()
    const evidence = {
      summaryText: s.summary.text,
      previewRows: s.preview.rows.map((x) => x.text),
      skippedSummary: s.skipped.summaryText,
      skippedItems: expanded?.items ?? s.skipped.listItems,
      skippedCount: s.skipped.listItems.length,
      importButton: { text: s.importButton.text, disabled: s.importButton.disabled },
      expandedVisible: expanded?.items.every((i) => i.visible) ?? null,
    }
    assert(s.preview.rows.length === 1, `expected 1 parsed entry, got ${s.preview.rows.length}`)
    assert(s.skipped.listItems.length === 3, `expected 3 skipped lines, got ${s.skipped.listItems.length}`)
    assert(s.importButton.text === 'Import 1', `button text = ${s.importButton.text}`)
    assert(expanded?.items.every((i) => i.visible), 'skipped rows not visible after expanding')
    rec(12, 'Partial input: 1 parses, 3 skipped with reasons, "Import 1"', true, evidence)
    await page.evaluate(() => {
      const cancel = [...document.querySelectorAll('.sheet-actions button')].find((b) =>
        /Cancel/.test(b.innerText),
      )
      cancel?.click()
    })
    await sheetGone()
  }

  /* ---------------------------------------------------------------- 13 ---- */
  {
    const beforeReload = await state()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.tab-bar .tab-button')
    await sleep(400)
    const afterReload = await state()
    await gotoSection('history')
    await sleep(250)
    const history = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('.entry-row--detailed')].map((r) =>
        r.innerText.replace(/\s+/g, ' ').trim(),
      ),
      subtitle: document.querySelector('.view-subtitle')?.innerText ?? null,
    }))
    const evidence = {
      entriesBeforeReload: beforeReload.entries.length,
      entriesAfterReload: afterReload.entries.length,
      after: afterReload.entries.map((e) => ({ date: e.date, weightKg: e.weightKg })),
      historyRows: history.rows,
      subtitle: history.subtitle,
    }
    assert(afterReload.entries.length === 4, `entries after reload = ${afterReload.entries.length}`)
    assert(history.rows.length === 4, `history rows after reload = ${history.rows.length}`)
    rec(13, 'Imported entries survive a reload', true, evidence)
  }

  /* ---------------------------------------------------------------- 15 ---- */
  {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
    await sleep(300)
    await gotoSection('settings')
    await openImporter()
    await setTextarea(SUMMARY_5)
    const contrast = await page.evaluate(() => {
      const lum = (str) => {
        const m = str.match(/[\d.]+/g).map(Number)
        const [r, g, b] = m
        const f = (c) => {
          const s = c / 255
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const ratio = (a, b) => {
        const l1 = lum(a)
        const l2 = lum(b)
        const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
        return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
      }
      const bgOf = (el) => {
        let n = el
        while (n && n !== document.documentElement) {
          const bg = getComputedStyle(n).backgroundColor
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg
          n = n.parentElement
        }
        return getComputedStyle(document.body).backgroundColor
      }
      const probe = (sel, label) => {
        const el = document.querySelector(sel)
        if (!el) return { label, missing: true }
        const cs = getComputedStyle(el)
        const bg = bgOf(el)
        return {
          label,
          text: el.innerText?.replace(/\s+/g, ' ').trim().slice(0, 40) ?? '',
          color: cs.color,
          bg,
          ratio: ratio(cs.color, bg),
          fontSize: cs.fontSize,
        }
      }
      return {
        dark: matchMedia('(prefers-color-scheme: dark)').matches,
        themeAttr: document.documentElement.getAttribute('data-theme'),
        panelBg: getComputedStyle(document.querySelector('.sheet-panel')).backgroundColor,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        probes: [
          probe('.sheet-title', 'sheet title'),
          probe('.sheet-subtitle', 'subtitle'),
          probe('.import-textarea', 'textarea'),
          probe('.import-count--new', 'new count'),
          probe('.import-count', 'count label'),
          probe('.import-row-date', 'row date'),
          probe('.import-row-weight', 'row weight'),
          probe('.import-row-note', 'row note'),
          probe('.sheet-actions .button--ghost', 'cancel'),
          probe('.sheet-actions .button--primary', 'import'),
          probe('.sheet-close', 'close icon'),
        ],
        placeholderColor: (() => {
          const cs = getComputedStyle(document.querySelector('.import-textarea'))
          return cs.getPropertyValue('color')
        })(),
      }
    })
    await page.screenshot({ path: path.join(OUT, 'import-dark-360x740-populated.png') })
    const evidence = { ...contrast }
    const low = contrast.probes.filter((p) => !p.missing && p.ratio < 4.5)
    evidence.belowWCAGAA = low.map((p) => `${p.label} ${p.ratio}:1`)
    assert(contrast.dark, 'dark mode not emulated')
    assert(low.length === 0, `low contrast text in dark mode: ${JSON.stringify(low)}`)
    out.darkSheet = await readSheet()
    rec(15, 'Dark mode: importer renders legibly (all text >= 4.5:1)', true, evidence)
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
    await sleep(200)
  }

  /* ---------------------------------------------------------------- 14 ---- */
  {
    // snapshot innerText in several states, looking for U+FFFD
    const snap = async (label) => {
      const t = await page.evaluate(() => document.body.innerText)
      const bad = [...t].filter((c) => c === '\uFFFD').length
      ufffdSnapshots.push({ label, replacementChars: bad })
      return bad
    }
    const states = {}
    states.sheetOpenPopulated = await snap('sheet open, populated')
    // empty textarea shows the format hint
    await setTextarea('')
    const hint = await page.evaluate(() => ({
      text: document.querySelector('.import-summary')?.innerText ?? null,
      full: document.body.innerText.includes('\uFFFD'),
    }))
    states.sheetOpenEmpty = await snap('sheet open, empty textarea (hint)')
    await page.evaluate(() => {
      const cancel = [...document.querySelectorAll('.sheet-actions button')].find((b) =>
        /Cancel/.test(b.innerText),
      )
      cancel?.click()
    })
    await sheetGone()
    states.settings = await snap('settings view')
    await gotoSection('history')
    await sleep(200)
    states.history = await snap('history view')
    await gotoSection('dashboard')
    await sleep(300)
    states.dashboard = await snap('dashboard view')

    const evidence = {
      hint,
      ufffd: ufffdSnapshots,
      consoleErrors,
      pageErrors,
      failedRequests: failedRequests.filter((u) => !/favicon/.test(u)),
    }
    assert(!hint.full, 'U+FFFD found in sheet innerText (empty state hint)')
    assert(
      ufffdSnapshots.every((s) => s.replacementChars === 0),
      `U+FFFD found: ${JSON.stringify(ufffdSnapshots)}`,
    )
    assert(consoleErrors.length === 0, `console errors: ${JSON.stringify(consoleErrors)}`)
    assert(pageErrors.length === 0, `page errors: ${JSON.stringify(pageErrors)}`)
    rec(14, 'No U+FFFD in innerText; zero console/page errors', true, evidence)
  }

  /* ---------------------------------------------------------------- 16 ---- */
  {
    await gotoSection('settings')
    await sleep(200)
    await openImporter()
    const beforeEscape = await page.evaluate(() => ({
      focusOnOpen: {
        tag: document.activeElement?.tagName,
        cls: document.activeElement?.className,
      },
    }))
    await page.keyboard.press('Escape')
    await sheetGone()
    await sleep(150)
    const after = await page.evaluate(() => ({
      sheetOpen: !!document.querySelector('.sheet-layer.is-open'),
      active: {
        tag: document.activeElement?.tagName,
        key: document.activeElement?.dataset?.focusKey ?? null,
        text: document.activeElement?.innerText?.trim() ?? null,
      },
    }))
    const evidence = { ...beforeEscape, ...after }
    assert(!after.sheetOpen, 'Escape did not close the sheet')
    assert(after.active.key === 'settings-import-list', `focus went to ${JSON.stringify(after.active)}`)
    rec(16, 'Escape closes the sheet and restores focus to the opener', true, evidence)
  }

  /* ---------------------------------------------------------------- 17 ---- */
  {
    await openImporter()
    await setTextarea(SUMMARY_5)
    const a11y = await page.evaluate(() => {
      const panel = document.querySelector('.sheet-panel')
      const buttons = [...panel.querySelectorAll('button')].map((b) => {
        const name =
          (b.getAttribute('aria-label') || '').trim() ||
          (b.getAttribute('aria-labelledby')
            ? document.getElementById(b.getAttribute('aria-labelledby'))?.textContent
            : '') ||
          b.innerText.trim() ||
          b.getAttribute('title') ||
          ''
        const iconOnly = b.innerText.trim() === ''
        return { name, iconOnly, hasAccessibleName: name.length > 0, html: b.outerHTML.slice(0, 120) }
      })
      const ta = panel.querySelector('.import-textarea')
      const labelEl = ta.id ? panel.querySelector(`label[for="${ta.id}"]`) : null
      const lis = [...panel.querySelectorAll('.import-preview li')]
      const ul = panel.querySelector('.import-preview ul')
      return {
        buttons,
        textarea: {
          id: ta.id,
          ariaLabel: ta.getAttribute('aria-label'),
          labelFor: labelEl?.textContent ?? null,
          labelLinked: !!labelEl,
          labelsProperty: ta.labels ? ta.labels.length : null,
        },
        list: {
          ulTag: ul?.tagName ?? null,
          liTags: lis.map((l) => l.tagName),
          liCount: lis.length,
          listStyle: ul ? getComputedStyle(ul).listStyleType : null,
        },
        dialog: {
          role: panel.getAttribute('role'),
          modal: panel.getAttribute('aria-modal'),
          labelledby: panel.getAttribute('aria-labelledby'),
          labelledbyResolves: !!document.getElementById(panel.getAttribute('aria-labelledby')),
          summaryLive: document.querySelector('.import-summary')?.getAttribute('aria-live'),
        },
      }
    })
    const evidence = a11y
    assert(
      a11y.buttons.every((b) => b.hasAccessibleName),
      `button without accessible name: ${JSON.stringify(a11y.buttons.filter((b) => !b.hasAccessibleName))}`,
    )
    assert(a11y.textarea.labelLinked || a11y.textarea.ariaLabel, 'textarea has no label')
    assert(a11y.list.ulTag === 'UL' && a11y.list.liTags.every((t) => t === 'LI'), 'preview is not ul/li')
    assert(a11y.dialog.labelledbyResolves, 'dialog aria-labelledby does not resolve')
    rec(17, 'Accessibility: named buttons, labelled textarea, real ul/li preview', true, evidence)
    await page.evaluate(() => {
      const cancel = [...document.querySelectorAll('.sheet-actions button')].find((b) =>
        /Cancel/.test(b.innerText),
      )
      cancel?.click()
    })
    await sheetGone()
  }

  /* ---------------------------------------------------------------- 18 ---- */
  {
    await gotoSection('settings')
    await sleep(300)
    const sel = (key) => `[data-focus-key="${key}"]`
    const clickAndRetype = async (key, text) => {
      await page.waitForSelector(sel(key))
      await page.click(sel(key))
      await page.keyboard.down('Control')
      await page.keyboard.press('KeyA')
      await page.keyboard.up('Control')
      await page.keyboard.type(text, { delay: 40 })
      await sleep(120)
    }
    await clickAndRetype('profile-start-weight', '82')
    await clickAndRetype('profile-goal-weight', '75') // click blurs + commits the previous field
    await clickAndRetype('profile-height', '180')
    // blur the last field (spec: "blur")
    await page.evaluate(() => {
      const el = document.querySelector('[data-focus-key="profile-height"]')
      el?.blur()
    })
    await sleep(400)
    const st = await state()
    const values = await page.evaluate(() => ({
      start: document.querySelector('[data-focus-key="profile-start-weight"]')?.value,
      goal: document.querySelector('[data-focus-key="profile-goal-weight"]')?.value,
      height: document.querySelector('[data-focus-key="profile-height"]')?.value,
      invalid: [...document.querySelectorAll('.field-input[aria-invalid]')].length,
    }))
    const evidence = { fieldValues: values, profile: st.profile }
    assert(values.start === '82', `start = ${values.start}`)
    assert(values.goal === '75', `goal = ${values.goal}`)
    assert(values.height === '180', `height = ${values.height}`)
    assert(st.profile.startWeightKg === 82, `stored start = ${st.profile.startWeightKg}`)
    assert(st.profile.goalWeightKg === 75, `stored goal = ${st.profile.goalWeightKg}`)
    assert(st.profile.heightCm === 180, `stored height = ${st.profile.heightCm}`)
    rec(18, 'Profile fields keep 82 / 75 / 180 (no 8275180 concatenation)', true, evidence)
  }

  /* ---------------------------------------------------------------- 19 ---- */
  {
    await gotoSection('dashboard')
    await sleep(400)
    const stBefore = await state()
    const latest = [...stBefore.entries].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-1)[0]
    await page.click('.fab')
    await page.waitForSelector('.sheet-layer.is-open .big-number-value')
    await sleep(400)
    const opened = await page.evaluate(() => {
      const input = document.querySelector('.big-number-value')
      return {
        value: input.value,
        focused: document.activeElement === input,
        activeTag: document.activeElement?.tagName,
        activeCls: document.activeElement?.className,
        date: document.querySelector('.sheet-panel input[type="date"]')?.value ?? null,
        selection: [input.selectionStart, input.selectionEnd],
      }
    })
    await page.keyboard.down('Control')
    await page.keyboard.press('KeyA')
    await page.keyboard.up('Control')
    await page.keyboard.type('745', { delay: 40 })
    await sleep(100)
    await page.evaluate(() => document.querySelector('.sheet-actions .button--primary').click())
    await page.waitForSelector('.toast.is-visible', { timeout: 3000 })
    const toast = await page.evaluate(() =>
      document.querySelector('.toast').innerText.replace(/\s+/g, ' ').trim(),
    )
    await sheetGone()
    await sleep(250)
    const stAfter = await state()
    const todayEntry = stAfter.entries.find((e) => e.date === opened.date)
    const evidence = {
      prefill: opened,
      expectedPrefill: latest?.weightKg ?? null,
      toast,
      savedEntry: todayEntry ? { date: todayEntry.date, weightKg: todayEntry.weightKg } : null,
      totalEntries: stAfter.entries.length,
    }
    assert(opened.focused, 'weight input was not focused on open')
    assert(opened.value === '75.5', `prefill = ${opened.value} (expected 75.5)`)
    assert(todayEntry && Math.abs(todayEntry.weightKg - 74.5) < 0.001, `stored ${todayEntry?.weightKg}`)
    rec(19, 'Log sheet focused + prefilled 75.5; typing 745 saves 74.5', true, evidence)
  }

  /* ---------------------------------------------------------------- 20 ---- */
  {
    await gotoSection('dashboard')
    await sleep(700)
    const canvas = await page.evaluate(() => {
      const c = document.querySelector('canvas')
      if (!c) return { found: false }
      const ctx = c.getContext('2d')
      let data
      try {
        data = ctx.getImageData(0, 0, c.width, c.height).data
      } catch (e) {
        return { found: true, error: String(e) }
      }
      let painted = 0
      let alphaPixels = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 8) {
          alphaPixels++
          if (!(data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250)) painted++
        }
      }
      const r = c.getBoundingClientRect()
      return {
        found: true,
        width: c.width,
        height: c.height,
        cssWidth: Math.round(r.width),
        cssHeight: Math.round(r.height),
        alphaPixels,
        paintedPixels: painted,
        distinctSample: [...new Set([data[0], data[1], data[2], data[3]])],
      }
    })
    const evidence = canvas
    assert(canvas.found, 'no canvas in the DOM')
    assert(canvas.paintedPixels > 500, `canvas looks blank (${canvas.paintedPixels} painted px)`)
    rec(20, 'Chart canvas exists and renders non-blank pixels', true, evidence)
    await page.screenshot({ path: path.join(OUT, 'dashboard-360x740.png') })
  }

  /* --------------------------------------------------- final screenshots -- */
  {
    await gotoSection('settings')
    await sleep(300)
    await openImporter()
    await setTextarea(`5 Mar 2026 74.5
12 Mar 2026 74.8
19 Mar 2026 75.1 after gym
26 Mar 2026 75.5
2 Apr 2026 75.2`)
    await page.screenshot({ path: path.join(OUT, 'import-light-360x740-final.png') })
    await page.evaluate(() => {
      const cancel = [...document.querySelectorAll('.sheet-actions button')].find((b) =>
        /Cancel/.test(b.innerText),
      )
      cancel?.click()
    })
    await sheetGone()
  }

  fs.writeFileSync(
    path.resolve('qa/results.json'),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        viewport: '360x740 primary, 320x568 narrow',
        results,
        consoleErrors,
        pageErrors,
        failedRequests,
        ufffdSnapshots,
        stateAfterFirstImport: out.stateAfterFirst,
        stateAfterConflictImport: out.stateAfterConflict,
      },
      null,
      2,
    ),
  )
  console.log('\n=== SUMMARY ===')
  for (const r of results) console.log(`${r.status}  ${r.id}  ${r.name}`)
  console.log(`console errors: ${consoleErrors.length}, page errors: ${pageErrors.length}`)
} catch (e) {
  console.log('SCRIPT ERROR', e)
  fs.writeFileSync(
    path.resolve('qa/results-partial.json'),
    JSON.stringify({ results, error: String(e) }, null, 2),
  )
} finally {
  await browser.close()
}
