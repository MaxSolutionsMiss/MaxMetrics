// Does "Check this PC" actually catch a machine that is out of step?
import { chromium } from 'playwright';
const F='file:///home/user/MaxMetrics/docs/morning-dashboard/Morning_Dashboard.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const DISK={};

async function pc(label, clockOffsetDays=0){
  const ctx=await b.newContext({viewport:{width:1350,height:980}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('  !! '+label+': '+e.message));
  if (clockOffsetDays) {                      // pretend this PC's date is wrong
    await ctx.addInitScript(off=>{
      const Real=Date, shift=off*86400000;
      // eslint-disable-next-line no-global-assign
      Date = class extends Real {
        constructor(...a){ if(!a.length) super(Real.now()+shift); else super(...a); }
        static now(){ return Real.now()+shift; }
      };
    }, clockOffsetDays);
  }
  await p.exposeFunction('_read', n=>DISK[n]??null);
  await p.exposeFunction('_write',(n,t)=>{DISK[n]=t;});
  await p.exposeFunction('_exists',n=>Object.prototype.hasOwnProperty.call(DISK,n));
  await p.exposeFunction('_names',()=>Object.keys(DISK));
  await p.goto(F); await p.waitForTimeout(1400);
  await p.evaluate(l=>{
    localStorage.setItem(meKey,JSON.stringify({name:l,ini:l.slice(0,2).toUpperCase()}));
    window.__DIR={ name:'Shared', getDirectoryHandle(){return Promise.resolve(window.__DIR);},
      removeEntry: async()=>{},
      async *values(){ for (const n of await window._names()) yield {name:n, kind:'file'}; },
      async getFileHandle(n,o){ const there=await window._exists(n);
        if(!there&&!(o&&o.create)){const e=new Error('nope');e.name='NotFoundError';throw e;}
        return { createWritable:async()=>({write:async t=>{await window._write(n,t);},close:async()=>{}}),
                 getFile:async()=>({text:async()=>window._read(n)}) };}};
  }, label);
  await p.evaluate(async()=>{ await adoptFolder(window.__DIR); });
  await p.waitForTimeout(900);
  await p.evaluate(()=>document.querySelector('.mdl-bg')?.remove());
  return p;
}
const report = async p => {
  await p.evaluate(()=>checkThisPC());
  await p.waitForTimeout(1200);
  const t = await p.$eval('.mdl-bg', n=>n.innerText.replace(/\n{2,}/g,'\n').trim());
  await p.evaluate(()=>document.querySelector('.mdl-bg')?.remove());
  return t;
};

// a healthy PC fills the morning in
const good = await pc('Plant');
await good.evaluate(()=>{const e=document.getElementById('i-short'); e.value='2';
  e.dispatchEvent(new Event('input',{bubbles:true}));});
await good.click('#draftBtn'); await good.waitForTimeout(1200);
await good.evaluate(()=>document.querySelector('.mdl-bg')?.remove());
console.log('════ a healthy PC ════');
console.log(await report(good));

// the boardroom PC, clock a day behind
const off = await pc('Boardroom', -1);
console.log('\n════ a PC whose clock is a day out ════');
console.log(await report(off));
await b.close();
