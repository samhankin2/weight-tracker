import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 360, height: 740 })
await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' })
await page.click('.fab')
await new Promise(r => setTimeout(r, 700))
const info = await page.evaluate(() => {
  const a = document.activeElement
  return {
    tag: a?.tagName,
    cls: a?.className,
    label: a?.getAttribute('aria-label'),
    autofocusEls: [...document.querySelectorAll('[data-autofocus]')].map(e => e.tagName + '.' + e.className),
    sheetOpen: !!document.querySelector('.sheet-layer.is-open'),
  }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
