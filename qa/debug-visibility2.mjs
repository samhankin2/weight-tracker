import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = new Date()
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
let stamp = Date.now()
const seed = {
  entries: Array.from({ length: 40 }, (_, i) => ({
    date: daysAgo(39 - i),
    weightKg: Math.round((82 - i * 0.2) * 10) / 10,
    createdAt: stamp++,
    updatedAt: stamp++,
  })),
  phases: [{ id: 'p', name: 'Bulk', startDate: daysAgo(14), endDate: null, color: '#f59e0b', createdAt: stamp++ }],
  profile: { startWeightKg: 80, goalWeightKg: 75, heightCm: 180, unit: 'kg', chartWindowDays: 90 },
  version: 1,
}

async function scenario(reduced, waitMs) {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    ...(reduced ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : []),
  ])
  await page.evaluateOnNewDocument((v) => { try { localStorage.setItem('weight-tracker:v1', v) } catch {} }, JSON.stringify(seed))
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(700)
  await page.click('.fab')
  await sleep(waitMs)
  const state = await page.evaluate((reduced, waitMs) => {
    const input = document.querySelector('.big-number-value')
    const logSheet = document.querySelector('.log-sheet')
    const content = document.querySelector('.sheet-content')
    const r = input.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const visChain = []
    let node = input
    while (node && node !== document.body) {
      visChain.push(`${node.tagName}.${String(node.className).slice(0, 25)}=${getComputedStyle(node).visibility}`)
      node = node.parentElement
    }
    return {
      reduced,
      waitMs,
      inputVisibility: getComputedStyle(input).visibility,
      logSheetVisibility: getComputedStyle(logSheet).visibility,
      contentVisibility: getComputedStyle(content).visibility,
      hit: hit ? `${hit.tagName}.${hit.className}` : null,
      hiddenAncestor: Boolean(input.closest('[hidden]')),
      inlineStyle: logSheet.getAttribute('style'),
      logSheetRules: (() => {
        const found = []
        for (const sheet of document.styleSheets) {
          let rules
          try { rules = sheet.cssRules } catch { continue }
          const walk = (list, media = '') => {
            for (const rule of list) {
              if (rule.cssRules) walk(rule.cssRules, rule.conditionText || media)
              else if (rule.selectorText && /log-sheet|big-number|sheet-content/.test(rule.selectorText) && /visibility/.test(rule.cssText)) {
                found.push(rule.cssText)
              }
            }
          }
          walk(rules)
        }
        return found
      })(),
      visChain,
      animations: document.getAnimations({ subtree: true }).map((a) => ({
        type: a.constructor.name,
        property: a.transitionProperty || a.animationName,
        target: `${a.effect?.target?.tagName}.${String(a.effect?.target?.className).slice(0, 25)}`,
        currentTime: a.currentTime,
        playState: a.playState,
      })).filter((a) => /visibility|log-sheet/.test(String(a.property) + a.target)).slice(0, 20),
    }
  }, reduced, waitMs)
  await page.screenshot({ path: `qa/regression/shots/_probe-reduced${reduced}-${waitMs}.png` })
  await browser.close()
  return state
}

console.log(JSON.stringify(await scenario(true, 350), null, 2))
console.log(JSON.stringify(await scenario(true, 900), null, 2))
console.log(JSON.stringify(await scenario(false, 350), null, 2))
console.log(JSON.stringify(await scenario(false, 900), null, 2))

