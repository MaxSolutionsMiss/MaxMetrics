// A SharePoint library synced to a PC is not a drive letter, and the difference is the
// whole risk of moving the morning there.
//
// On Z: everybody writes the same bytes, so reading the file back before saving catches
// what other people did. Synced, each PC writes its OWN copy and the sync client
// reconciles a minute later — and when two saves land inside that minute it does not
// merge them. It keeps one and drops the other beside it under a new name:
//
//     2026-08-25-JEHNAE-PC.json
//     2026-08-25 (Jehnae's conflicted copy 2026-08-25).json
//
// Nothing reads those. That is a full, correct morning sitting in the folder forever,
// unopened, and the person who typed it says their comments are missing.
//
// This test makes the sync client behave badly on purpose and checks the morning is
// recovered anyway.
import { chromium } from 'playwright';
const F='file:///home/user/MaxMetrics/docs/morning-dashboard/Morning_Dashboard.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const DISK={};
let fails=0;
const ok=(t,c,extra='')=>{ if(!c)fails++; console.log((c?'  ok   ':'  FAIL ')+t+(extra?'   '+extra:'')); };

async function newPC(label){
  const ctx=await b.newContext({viewport:{width:1400,height:1000}});
  await ctx.exposeFunction('_read', n=>DISK[n]??null);
  await ctx.exposeFunction('_write',(n,t)=>{DISK[n]=t;});
  await ctx.exposeFunction('_exists',n=>Object.prototype.hasOwnProperty.call(DISK,n));
  await ctx.exposeFunction('_list', ()=>Object.keys(DISK));
  await ctx.addInitScript(l=>{
    localStorage.setItem('dash_me',JSON.stringify({name:l,ini:l.slice(0,2).toUpperCase()}));
    const mk=n=>({kind:'file',name:n,
      getFile:async()=>({text:async()=>window._read(n)})});
    window.__DIR={ name:'Daily Morning Dashboard',
      getDirectoryHandle(){return Promise.resolve(window.__DIR);},
      removeEntry: async()=>{},
      async *values(){ for(const n of await window._list()) yield mk(n); },
      async getFileHandle(n,o){ const there=await window._exists(n);
        if(!there&&!(o&&o.create)){const e=new Error('nope');e.name='NotFoundError';throw e;}
        return { ...mk(n),
          createWritable:async()=>({write:async t=>{await window._write(n,t);},close:async()=>{}}) };}};
  }, label);
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('  !! '+label+': '+e.message));
  await p.goto(F); await p.waitForTimeout(1200);
  await p.evaluate(async()=>{ await adoptFolder(window.__DIR); });
  await p.waitForTimeout(1200);
  await p.evaluate(()=>document.querySelector('.mdl-bg')?.remove());
  return p;
}
const save = async p => {
  await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
  await p.click('#draftBtn'); await p.waitForTimeout(1200);
};
const val = (p,id) => p.evaluate(i=>document.getElementById(i)?.value ?? '(gone)', id);
const type = async (p,id,v) => p.evaluate(([i,x])=>{
  const e=document.getElementById(i); e.value=x;
  e.dispatchEvent(new Event('input',{bubbles:true}));
  e.dispatchEvent(new Event('change',{bubbles:true}));
}, [id,v]);

const jehnae = await newPC('Jehnae');
const day = await jehnae.evaluate(()=>document.getElementById('dashDate').value);

console.log('\n1 — Jehnae saves the morning, and it syncs up normally');
await type(jehnae,'i-jobs','44');
await jehnae.evaluate(()=>addComment('staffing','Angie off Thursday'));
await jehnae.waitForTimeout(200);
await save(jehnae);
ok('the morning is in the library', !!DISK[day+'.json']);

console.log('\n2 — Marco saves inside the sync window, so OneDrive strands his copy');
const marco = await newPC('Marco');
await marco.waitForTimeout(600);
await type(marco,'i-cartons','91200');
await marco.evaluate(()=>addComment('staffing','Marco covering Thursday'));
await marco.evaluate(()=>addComment('shipping','Two trucks late out of Dock 3'));
await marco.waitForTimeout(200);
await save(marco);
// This is the sync client's doing, not the page's: keep Jehnae's, rename Marco's beside it.
const marcoCopy = DISK[day+'.json'];
DISK[day+'.json'] = DISK['__jehnae'] ?? marcoCopy;
{
  // put Jehnae's back as the winner and strand Marco's under OneDrive's naming
  const j = await jehnae.evaluate(d=>JSON.stringify(getStore()[d]), day);
  DISK[day+'.json'] = j;
  DISK[day+'-MARCO-PC.json'] = marcoCopy;
}
ok('a stranded copy exists', !!DISK[day+'-MARCO-PC.json']);
ok('and nothing in the morning mentions Marco',
   !DISK[day+'.json'].includes('Marco covering Thursday'));

console.log('\n3 — the next person to open the morning rescues it');
await jehnae.evaluate(()=>refreshFromFolder());
await jehnae.waitForTimeout(1000);
let texts = await jehnae.evaluate(()=>[
  ...(COMMENTS.staffing||[]).map(c=>c.text), ...(COMMENTS.shipping||[]).map(c=>c.text)]);
ok('Marco’s staffing note is back', texts.includes('Marco covering Thursday'), JSON.stringify(texts));
ok('Marco’s shipping note is back', texts.includes('Two trucks late out of Dock 3'));
ok('Jehnae’s own note is still there', texts.includes('Angie off Thursday'));
ok('Marco’s cartons came back too', await val(jehnae,'i-cartons')==='91200', 'shows '+await val(jehnae,'i-cartons'));
ok('Jehnae’s jobs survived',        await val(jehnae,'i-jobs')==='44',      'shows '+await val(jehnae,'i-jobs'));

console.log('\n4 — the rescue is written back, so everyone sees it');
await save(jehnae);
ok('the shared morning now holds both', DISK[day+'.json'].includes('Marco covering Thursday'));

console.log('\n5 — and it is not done twice');
const beforeCount = (DISK[day+'.json'].match(/Marco covering Thursday/g)||[]).length;
await jehnae.evaluate(()=>refreshFromFolder());
await jehnae.waitForTimeout(900);
await save(jehnae);
const afterCount = (DISK[day+'.json'].match(/Marco covering Thursday/g)||[]).length;
ok('no duplicate comments', beforeCount===afterCount, beforeCount+' then '+afterCount);
ok('the stranded file is left where it is, not deleted', !!DISK[day+'-MARCO-PC.json']);

console.log('\n6 — the other name OneDrive uses');
DISK[day+" (Jehnae's conflicted copy "+day+").json"] = JSON.stringify({
  comments:{priorities:[{id:'zz9',at:1,ini:'JR',name:'Jehnae',text:'Ship the Kraft order first',when:day+' 8:10 AM'}]},
  otd:'99.1'});
await marco.evaluate(()=>refreshFromFolder());
await marco.waitForTimeout(1000);
texts = await marco.evaluate(()=>(COMMENTS.priorities||[]).map(c=>c.text));
ok('the parenthesised form is rescued too', texts.includes('Ship the Kraft order first'), JSON.stringify(texts));
ok('and its numbers with it', await val(marco,'i-otd')==='99.1', 'shows '+await val(marco,'i-otd'));

console.log('\n7 — an unrelated file in the folder is left alone');
DISK['dashboard-'+day+'.json'] = JSON.stringify({otd:'11.1'});
DISK['_layout.json'] = JSON.stringify({});
await marco.evaluate(()=>refreshFromFolder());
await marco.waitForTimeout(900);
ok('an export is not mistaken for a conflicted copy', await val(marco,'i-otd')==='99.1',
   'shows '+await val(marco,'i-otd'));

console.log(fails ? `\n${fails} failed\n` : '\nall good\n');
await b.close();
process.exit(fails?1:0);
