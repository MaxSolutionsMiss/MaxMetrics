import { chromium } from 'playwright';
const F='file:///home/user/MaxMetrics/docs/morning-dashboard/Morning_Dashboard.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const DISK={};
const ctx=await b.newContext({viewport:{width:1500,height:1000},deviceScaleFactor:2});
await ctx.exposeFunction('_read', n=>DISK[n]??null);
await ctx.exposeFunction('_write',(n,t)=>{DISK[n]=t;});
await ctx.exposeFunction('_exists',n=>Object.prototype.hasOwnProperty.call(DISK,n));
await ctx.exposeFunction('_list', ()=>Object.keys(DISK));
await ctx.addInitScript(()=>{
  localStorage.setItem('dash_me',JSON.stringify({name:'Jehnae Resa',ini:'JR'}));
  const mk=n=>({kind:'file',name:n,getFile:async()=>({text:async()=>window._read(n)})});
  window.__DIR={name:'Daily Morning Dashboard',
    getDirectoryHandle(){return Promise.resolve(window.__DIR);},removeEntry:async()=>{},
    async *values(){ for(const n of await window._list()) yield mk(n); },
    async getFileHandle(n,o){ const there=await window._exists(n);
      if(!there&&!(o&&o.create)){const e=new Error('x');e.name='NotFoundError';throw e;}
      return {...mk(n),createWritable:async()=>({write:async t=>{await window._write(n,t);},close:async()=>{}})};}};
});
const p=await ctx.newPage();
await p.goto(F); await p.waitForTimeout(1400);
await p.evaluate(async()=>{await adoptFolder(window.__DIR);});
await p.waitForTimeout(900);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
// a realistic morning, saved, so the screen and the file agree
await p.evaluate(()=>{
  const set=(id,v)=>{const e=document.getElementById(id); if(e){e.value=v;
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}};
  set('i-injDate','2026-08-05'); set('i-injRec','136');
  set('i-nmDate','2026-07-31'); set('i-nmRec','89');
  set('i-jobs','41'); set('i-jobsOT','39'); set('i-cartons','128400');
  set('i-late','2'); set('i-shorts','0'); set('i-otd','95.1'); set('i-otif','93.8');
  addComment('staffing','Angie: off Aug. 27 and 28');
  addComment('staffing','Anton P.: off this week');
});
await p.waitForTimeout(400);
await p.click('#draftBtn'); await p.waitForTimeout(1400);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
await p.evaluate(()=>checkThisPC()); await p.waitForTimeout(1200);
await p.locator('.mdl').screenshot({path:'doc/f-checkpc.png'});
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
await p.locator('#topHdr').screenshot({path:'doc/f-header-ok.png'});
const card = await p.$('#watchCard');
if(card) await card.screenshot({path:'doc/f-comments.png'});
await b.close();
console.log('files in fake folder:', Object.keys(DISK));
