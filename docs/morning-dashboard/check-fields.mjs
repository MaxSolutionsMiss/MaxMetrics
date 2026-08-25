// Fill every field the morning has, save it, open the file on a clean PC, and compare.
// A field that saves but never loads is invisible to everyone but the person who typed it.
import { chromium } from 'playwright';
const F='file:///home/user/MaxMetrics/docs/morning-dashboard/Morning_Dashboard.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const DISK={};

async function pc(label){
  const p=await (await b.newContext({viewport:{width:1400,height:1000}})).newPage();
  p.on('pageerror',e=>console.log('  !! '+label+': '+e.message));
  await p.exposeFunction('_read', n=>DISK[n]??null);
  await p.exposeFunction('_write',(n,t)=>{DISK[n]=t;});
  await p.exposeFunction('_exists',n=>Object.prototype.hasOwnProperty.call(DISK,n));
  await p.goto(F); await p.waitForTimeout(1500);
  await p.evaluate(l=>{
    localStorage.setItem(meKey,JSON.stringify({name:l,ini:l.slice(0,2).toUpperCase()}));
    window.__DIR={ name:'Shared', getDirectoryHandle(){return Promise.resolve(window.__DIR);},
      removeEntry: async()=>{},
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

const author = await pc('Author');
// Fill every visible input/select/textarea that the page treats as a field.
const written = await author.evaluate(()=>{
  const out={}; let k=0;
  document.querySelectorAll('input,select,textarea').forEach(el=>{
    if(!el.id || el.type==='file' || el.type==='checkbox' || el.type==='radio') return;
    if(el.id==='dashDate') return;                     // the date drives everything else
    k++;
    if(el.tagName==='SELECT'){
      const opts=[...el.options].filter(o=>o.value);
      if(!opts.length) return;
      el.value = opts[k % opts.length].value;
    } else if (el.type==='date') {
      el.value = '2026-0'+(1+(k%9))+'-1'+(k%9);
    } else if (el.type==='number') {
      el.value = String(100+k);
    } else {
      el.value = 'V'+k;
    }
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    out[el.id]=el.value;
  });
  return out;
});
console.log('fields filled :', Object.keys(written).length);
await author.click('#draftBtn'); await author.waitForTimeout(1400);
const day = Object.keys(DISK).find(k=>/^\d{4}-/.test(k));
console.log('saved         :', day || 'NOTHING');

const reader = await pc('Reader');
await reader.waitForTimeout(1400);
const seen = await reader.evaluate(ids=>Object.fromEntries(
  ids.map(i=>[i, document.getElementById(i)?.value ?? '(no such field)'])), Object.keys(written));

const lost = Object.entries(written).filter(([id,v]) => seen[id] !== v);
console.log('came back     :', Object.keys(written).length - lost.length, 'of', Object.keys(written).length);
if (lost.length) {
  console.log('\nnot restored on the clean PC:');
  for (const [id,v] of lost.slice(0,25)) console.log(`   ${id.padEnd(24)} saved ${JSON.stringify(v).padEnd(14)} shows ${JSON.stringify(seen[id])}`);
  if (lost.length>25) console.log(`   … and ${lost.length-25} more`);
}
const cards = await reader.evaluate(()=>({
  jobsLogged: document.getElementById('d-ppLogged')?.textContent.trim(),
  bookedInGT: document.getElementById('d-ppBooked')?.textContent.trim(),
  shortage:   document.getElementById('d-short')?.textContent.trim(),
}));
console.log('\ncards on the clean PC:', JSON.stringify(cards));
await b.close();
