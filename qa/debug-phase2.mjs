import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const now = new Date()
const daysAgo = (n) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
const createdAt = Date.now()
const entries = Array.from({length:40},(_,i)=>({date:daysAgo(39-i),weightKg:Math.round((82-i*0.2)*10)/10,createdAt,updatedAt:createdAt}))
const seed = {entries, phases:[], profile:{startWeightKg:82,goalWeightKg:75,heightCm:180,unit:'kg',chartWindowDays:90}, version:1}
const browser = await puppeteer.launch({executablePath:EDGE,headless:true,args:['--no-sandbox']})
const context = await browser.createBrowserContext()
const page = await context.newPage()
page.on('pageerror',e=>console.log('PAGEERROR',e.message))
await page.setViewport({width:360,height:740,isMobile:true,hasTouch:true})
await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'reduce'}])
await page.evaluateOnNewDocument((v)=>{try{localStorage.setItem('weight-tracker:v1',v)}catch{}}, JSON.stringify(seed))
await page.goto('http://localhost:5173',{waitUntil:'networkidle0'})
await page.reload({waitUntil:'networkidle0'})
await sleep(500)

const before = await page.evaluate(() => {
  const c = document.querySelector('.chart-frame canvas')
  const snapshot = new Uint8ClampedArray(c.getContext('2d').getImageData(0, 0, c.width, c.height).data)
  window.__beforeChart = { w: c.width, h: c.height, data: snapshot }
  return { dataUrl: c.toDataURL(), w: c.width, h: c.height }
})
console.log('before', before.w, before.h, before.dataUrl.length)
await page.click('section[aria-label="Training phases"] .button--small')
await page.waitForFunction(() => document.querySelector('.sheet-layer.is-open'))
await sleep(300)
await page.type('input[aria-label="Phase name"]', 'Bulk')
await page.evaluate((val)=>{const el=document.querySelector('input[aria-label="Phase start date"]'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,val); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));}, daysAgo(14))
console.log('pre-save', await page.evaluate(()=>({
  open:Boolean(document.querySelector('.sheet-layer.is-open')),
  title:document.querySelector('.sheet-title')?.textContent,
  name:document.querySelector('input[aria-label="Phase name"]')?.value,
  active:document.activeElement?.className,
  saveRect:document.querySelector('.sheet-actions .button--primary')?.getBoundingClientRect().toJSON(),
  atPoint:(()=>{const b=document.querySelector('.sheet-actions .button--primary');const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);return{cls:e?.className,text:e?.textContent?.trim()}})()
})))
await page.click('.sheet-actions .button--primary')
await sleep(900)
console.log('post-save', await page.evaluate(()=>({
  open:Boolean(document.querySelector('.sheet-layer.is-open')),
  toast:document.querySelector('.toast')?.textContent?.trim(),
  toastVisible:Boolean(document.querySelector('.toast')&&!document.querySelector('.toast').hidden),
  legend:document.querySelector('.phase-legend')?.innerText,
  phases:JSON.parse(localStorage.getItem('weight-tracker:v1')||'{}').phases,
  canvas:{w:document.querySelector('.chart-frame canvas')?.width,h:document.querySelector('.chart-frame canvas')?.height},
  afterFrame:!!window.__beforeChart,
})))
await browser.close()
