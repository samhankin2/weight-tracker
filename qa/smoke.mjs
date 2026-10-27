import puppeteer from 'puppeteer'
import fs from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
fs.mkdirSync('qa/screenshots', { recursive: true })

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.stack}`))
page.on('requestfailed', (r) => logs.push(`[REQFAIL] ${r.url()} ${r.failure()?.errorText}`))

await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 600))

const info = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  const fab = document.querySelector('.fab')
  const tabBar = document.querySelector('.tab-bar')
  const r = (el) => (el ? el.getBoundingClientRect().toJSON() : null)
  return {
    title: document.title,
    canvasFound: !!canvas,
    canvasConnected: canvas ? canvas.isConnected : false,
    canvasParent: canvas?.parentElement?.className ?? null,
    canvasSize: canvas ? { w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight } : null,
    chartFrameChildren: document.querySelector('.chart-frame')?.childElementCount,
    fab: r(fab),
    tabBar: r(tabBar),
    chartEmptyText: document.querySelector('.chart-empty')?.innerText,
    bodyText: document.body.innerText.slice(0, 500),
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }
})
await page.screenshot({ path: 'qa/screenshots/00-empty-360.png', fullPage: true })
console.log(JSON.stringify({ info, logs }, null, 2))
await browser.close()
