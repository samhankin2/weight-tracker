/**
 * Production build / service-worker verification (item 16).
 * Serves dist/ with a tiny static server and checks real SW registration.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'

const ROOT = path.resolve('dist')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 5199
const RESULTS = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function check(id, name, ok, details) {
  RESULTS.push({ id, name, ok: Boolean(ok), details })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name} :: ${JSON.stringify(details)}`)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname.endsWith('/')) pathname += 'index.html'
  let file = path.join(ROOT, pathname)
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA fallback
    file = path.join(ROOT, 'index.html')
  }
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
  })
  fs.createReadStream(file).pipe(res)
})

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0' })
  await sleep(1000)

  const support = await page.evaluate(() => ({
    secureContext: window.isSecureContext,
    hasServiceWorker: 'serviceWorker' in navigator,
    controllerOnFirstLoad: Boolean(navigator.serviceWorker?.controller),
  }))

  const registration = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { error: 'no serviceWorker' }
    const withTimeout = (promise, ms) =>
      Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), ms)),
      ])
    let reg = await navigator.serviceWorker.getRegistration()
    for (let i = 0; i < 40 && !reg; i++) {
      await new Promise((r) => setTimeout(r, 250))
      reg = await navigator.serviceWorker.getRegistration()
    }
    const ready = await withTimeout(navigator.serviceWorker.ready, 8000)
    if (!reg) return { error: 'no registration', ready: ready?.timeout ? 'timeout' : 'resolved' }
    return {
      scope: reg.scope,
      active: reg.active
        ? { state: reg.active.state, scriptURL: reg.active.scriptURL }
        : null,
      installing: reg.installing?.state ?? null,
      waiting: reg.waiting?.state ?? null,
      readyResolved: !ready?.timeout,
      controllerScriptURL: navigator.serviceWorker.controller?.scriptURL ?? null,
    }
  })

  check(
    '16-production-sw',
    'Production build registers a service worker with an active worker',
    support.secureContext &&
      support.hasServiceWorker &&
      registration.active?.state === 'activated' &&
      /sw\.js$/.test(registration.active?.scriptURL ?? ''),
    { support, registration, consoleErrors },
  )

  // Reload and confirm the built app is served (and, if claimed, controlled).
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(800)
  const afterReload = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    const cachesKeys = 'caches' in window ? await caches.keys() : []
    return {
      appRendered: Boolean(document.querySelector('.headline') || document.querySelector('.view')),
      controlled: Boolean(navigator.serviceWorker.controller),
      activeState: reg?.active?.state ?? null,
      caches: cachesKeys,
      title: document.title,
    }
  })
  check(
    '16b-built-app-loads',
    'Built app loads and the active SW remains after reload',
    afterReload.appRendered && afterReload.activeState === 'activated' && afterReload.title === 'Weight',
    afterReload,
  )

  // Offline reload smoke test (bonus): the SW should serve the cached shell.
  const context = page.browserContext()
  // Chrome DevTools offline emulation via CDP.
  const client = await page.createCDPSession()
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  })
  let offline = { loaded: false, error: null }
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
    await sleep(1200)
    offline.loaded = await page.evaluate(() => Boolean(document.querySelector('.view-host, .headline, .view')))
  } catch (error) {
    offline.error = String(error).slice(0, 300)
  }
  check('16c-offline-reload', 'Offline reload is served by the service worker cache (bonus)', offline.loaded, offline)
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  await context.close().catch(() => {})
} finally {
  await browser.close()
  server.close()
}

const summary = {
  passed: RESULTS.filter((r) => r.ok).length,
  failed: RESULTS.filter((r) => !r.ok).length,
  total: RESULTS.length,
  results: RESULTS,
}
fs.writeFileSync('qa/regression/prod-results.json', JSON.stringify(summary, null, 2))
console.log(`\n==== PROD SUMMARY: ${summary.passed} passed, ${summary.failed} failed (${summary.total} total) ====`)
if (summary.failed > 0) process.exitCode = 1
