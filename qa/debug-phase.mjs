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
const page = await browser.newPage()
page.on('console',m=>console.log('CONSOLE',m.type(),m.text()))
page.on('pageerror',e=>console.log('PAGEERROR',e.message))
await page.setViewport({width:360,height:740,isMobile:true,hasTouch:true})
await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'reduce'}])
await page.evaluateOnNewDocument((v)=>{try{localStorage.setItem('weight-tracker:v1',v)}catch{}}, JSON.stringify(seed))
await page.goto('http://localhost:5173',{waitUntil:'networkidle0'})
await page.reload({waitUntil:'networkidle0'})
await sleep(500)

// print card button
console.log('buttons', await page.evaluate(()=>[...document.querySelectorAll('section[aria-label="Training phases"] button')].map(b=>({cls:b.className,text:b.textContent.trim()}))))
await page.click('section[aria-label="Training phases"] .button--small')
await page.waitForFunction(()=>document.querySelector('.sheet-layer.is-open'))
await sleep(300)
console.log('sheet', await page.evaluate(()=>({
  title:document.querySelector('.sheet-title')?.textContent,
  fields:[...document.querySelectorAll('.sheet-content input')].map(i=>({aria:i.getAttribute('aria-label'),value:i.value,type:i.type,disabled:i.disabled,rect:i.getBoundingClientRect().toJSON()})),
  save: (()=>{const b=document.querySelector('.sheet-actions .button--primary'); const r=b?.getBoundingClientRect(); return b?{text:b.textContent.trim(),rect:r.toJSON(),visible:r.top>=0&&r.bottom<=innerHeight, atPoint:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.className}:null})(),
  panel:document.querySelector('.sheet-panel')?.getBoundingClientRect().toJSON(),
  contentScroll: (()=>{const c=document.querySelector('.sheet-content');return {sh:c?.scrollHeight,ch:c?.clientHeight}})(),
})))
await page.screenshot({path:'qa/screenshots/debug-phase-sheet.png'})
await page.type('input[aria-label="Phase name"]','Bulk')
console.log('name value after type', await page.$eval('input[aria-label="Phase name"]', el=>el.value))
// set date
await page.evaluate((val)=>{const el=document.querySelector('input[aria-label="Phase start date"]'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,val); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));}, daysAgo(14))
console.log('before save', await page.evaluate(()=>({name:document.querySelector('input[aria-label="Phase name"]').value,start:document.querySelector('input[aria-label="Phase start date"]').value,ongoing:document.querySelector('.checkbox-input')?.checked})))
await page.click('.sheet-actions .button--primary')
await sleep(800)
console.log('after save', await page.evaluate(()=>({
  sheetOpen:Boolean(document.querySelector('.sheet-layer.is-open')),
  toast:document.querySelector('.toast')?.textContent?.trim(),
  toastVisible:Boolean(document.querySelector('.toast')&&!document.querySelector('.toast').hidden&&document.querySelector('.toast').classList.contains('is-visible')),
  legend:document.querySelector('.phase-legend')?.innerText,
  state:JSON.parse(localStorage.getItem('weight-tracker:v1')||'null'),
})))
await page.screenshot({path:'qa/screenshots/debug-phase-after.png',fullPage:false})
await browser.close()
