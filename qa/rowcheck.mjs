import puppeteer from "puppeteer"
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.launch({executablePath:"C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",headless:true,args:["--no-sandbox"]})
const p=await b.newPage()
await p.setViewport({width:360,height:740,isMobile:true,hasTouch:true,deviceScaleFactor:2})
const iso=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
const now=new Date(); const entries=[]
for(let i=0;i<6;i++){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);entries.push({date:iso(d),weightKg:75-i*0.2,createdAt:1,updatedAt:1})}
const seed=JSON.stringify({entries,phases:[],profile:{startWeightKg:null,goalWeightKg:null,heightCm:null,unit:"kg",chartWindowDays:90},version:1})
await p.evaluateOnNewDocument((s)=>localStorage.setItem("weight-tracker:v1",s),seed)
await p.goto("http://localhost:5173",{waitUntil:"networkidle0"}); await sleep(600)
await p.$$eval(".tab-button",els=>els.find(b=>b.dataset.tab==="history")?.click()); await sleep(500)
const info=await p.evaluate(()=>{
 const row=document.querySelector(".entry-row--detailed")
 const deltas=[...row.querySelectorAll(".entry-delta")].map(e=>({text:e.textContent,r:e.getBoundingClientRect().toJSON()}))
 const weights=[...row.querySelectorAll(".entry-weight")].map(e=>({text:e.textContent,r:e.getBoundingClientRect().toJSON()}))
 return {html:row.outerHTML,deltas,weights,rowRect:row.getBoundingClientRect().toJSON(),deltasInDoc:document.querySelectorAll(".entry-delta").length,rows:document.querySelectorAll(".entry-row--detailed").length}
})
console.log(JSON.stringify(info,null,2))
await p.screenshot({path:"qa/screenshots/39-history-row-detail.png",fullPage:true})
await b.close()
