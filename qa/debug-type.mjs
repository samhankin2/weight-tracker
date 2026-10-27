import puppeteer from 'puppeteer'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const now = new Date(); const daysAgo = (n) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate()-n))
const createdAt = Date.now()
const entries = Array.from({length:5},(_,i)=>({date:daysAgo(4-i),weightKg:80-i,createdAt,updatedAt:createdAt}))
const seed = {entries, phases:[], profile:{startWeightKg:82,goalWeightKg:75,heightCm:180,unit:'kg',chartWindowDays:90}, version:1}
const browser = await puppeteer.launch({executablePath:EDGE,headless:true,args:['--no-sandbox']})
for (const variant of ['type-after-300','type-after-800','click-then-type']) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage()
  await page.setViewport({width:360,height:740,isMobile:true,hasTouch:true})
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'reduce'}])
  await page.evaluateOnNewDocument((v)=>{try{localStorage.setItem('weight-tracker:v1',v)}catch{}}, JSON.stringify(seed))
  await page.goto('http://localhost:5173',{waitUntil:'networkidle0'}); await page.reload({waitUntil:'networkidle0'}); await sleep(400)
  await page.click('section[aria-label="Training phases"] .button--small')
  await page.waitForFunction(()=>document.querySelector('.sheet-layer.is-open'))
  await sleep(variant==='type-after-800'?800:300)
  if (variant==='click-then-type') { await page.click('input[aria-label="Phase name"]'); await sleep(80); await page.keyboard.type('Bulk') }
  else { await page.type('input[aria-label="Phase name"]','Bulk') }
  const out = await page.evaluate(()=>({name:document.querySelector('input[aria-label="Phase name"]')?.value, active:document.activeElement?.getAttribute('aria-label')||document.activeElement?.className}))
  console.log(variant, out)
  await page.close(); await ctx.close()
}
await browser.close()
