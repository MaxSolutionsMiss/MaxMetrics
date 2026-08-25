// The sequence the plant actually described, in order, with nothing skipped:
//
//   type a number → Save → leave the page → come back → is it still there?
//   change a comment → Save → leave the page → come back → did the change stick?
//
// Every earlier test either saved and read on two different PCs, or filled and read
// without ever leaving. Neither covers "I hit save, and I go back" — which is the one
// thing being reported. So this one reloads the same PC, the way a person does.
import { chromium } from 'playwright';
const F='file:///home/user/MaxMetrics/docs/morning-dashboard/Morning_Dashboard.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const DISK={};
let fails=0;
const ok=(t,c,extra='')=>{ if(!c)fails++; console.log((c?'  ok   ':'  FAIL ')+t+(extra?'   '+extra:'')); };

// The fake share is installed before every navigation, so it is still there after a
// reload — the same way a real folder handle is, kept in IndexedDB.
async function newPC(label){
  const ctx=await b.newContext({viewport:{width:1400,height:1000}});
  await ctx.exposeFunction('_read', n=>DISK[n]??null);
  await ctx.exposeFunction('_write',(n,t)=>{DISK[n]=t;});
  await ctx.exposeFunction('_exists',n=>Object.prototype.hasOwnProperty.call(DISK,n));
  await ctx.addInitScript(l=>{
    localStorage.setItem('dash_me',JSON.stringify({name:l,ini:l.slice(0,2).toUpperCase()}));
    window.__DIR={ name:'Shared', getDirectoryHandle(){return Promise.resolve(window.__DIR);},
      removeEntry: async()=>{},
      async getFileHandle(n,o){ const there=await window._exists(n);
        if(!there&&!(o&&o.create)){const e=new Error('nope');e.name='NotFoundError';throw e;}
        return { createWritable:async()=>({write:async t=>{await window._write(n,t);},close:async()=>{}}),
                 getFile:async()=>({text:async()=>window._read(n)}) };}};
  }, label);
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('  !! '+label+': '+e.message));
  await p.goto(F); await p.waitForTimeout(1200);
  await p.evaluate(async()=>{ await adoptFolder(window.__DIR); });
  await p.waitForTimeout(1200);
  await p.evaluate(()=>document.querySelector('.mdl-bg')?.remove());
  return p;
}
// Coming back to the page: same browser, same storage, same folder — a reload.
async function comeBack(p){
  await p.reload(); await p.waitForTimeout(1200);
  await p.evaluate(async()=>{ await adoptFolder(window.__DIR); });
  await p.waitForTimeout(1200);
  await p.evaluate(()=>document.querySelector('.mdl-bg')?.remove());
}
// Clear anything the last save put on screen ("N boxes took the shared value") before
// pressing Save again — a person would have clicked Understood.
const save = async p => {
  await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
  await p.click('#draftBtn'); await p.waitForTimeout(1200);
};
const val  = (p,id) => p.evaluate(i=>document.getElementById(i)?.value ?? '(gone)', id);
const type = async (p,id,v) => p.evaluate(([i,x])=>{
  const e=document.getElementById(i); e.value=x;
  e.dispatchEvent(new Event('input',{bubbles:true}));
  e.dispatchEvent(new Event('change',{bubbles:true}));
}, [id,v]);

const p=await newPC('Jehnae');

console.log('\n1 — a number typed, saved, and looked at again');
await type(p,'i-jobs','41');
await type(p,'i-cartons','88000');
await save(p);
ok('the file was written', Object.keys(DISK).some(k=>/^\d{4}-/.test(k)));
await comeBack(p);
ok('jobs shipped is still 41', await val(p,'i-jobs')==='41', 'shows '+await val(p,'i-jobs'));
ok('cartons is still 88000',   await val(p,'i-cartons')==='88000', 'shows '+await val(p,'i-cartons'));

console.log('\n2 — the same number changed a second time');
await type(p,'i-jobs','52');
await save(p);
await comeBack(p);
ok('jobs shipped is now 52', await val(p,'i-jobs')==='52', 'shows '+await val(p,'i-jobs'));

console.log('\n3 — a comment written, saved, and looked at again');
await p.evaluate(()=>addComment('c-shipping-thread'?'shipping':'shipping','Two trucks late out of Dock 3'));
await p.waitForTimeout(300);
await save(p);
await comeBack(p);
let texts = await p.evaluate(()=>(COMMENTS.shipping||[]).map(c=>c.text));
ok('the comment came back', texts.includes('Two trucks late out of Dock 3'), JSON.stringify(texts));

console.log('\n4 — that comment EDITED, saved, and looked at again');
await p.evaluate(()=>{
  const c=(COMMENTS.shipping||[])[0];
  c.text='Three trucks late out of Dock 3'; c.edited=true; c.editedAt=Date.now();
  stashComments(); renderComments();
});
await save(p);
await comeBack(p);
texts = await p.evaluate(()=>(COMMENTS.shipping||[]).map(c=>c.text));
ok('the edit stuck', texts.includes('Three trucks late out of Dock 3'), JSON.stringify(texts));
ok('the old wording is gone', !texts.includes('Two trucks late out of Dock 3'));

console.log('\n5 — typed, NOT saved, then the page refreshes itself from the folder');
await type(p,'i-late','7');
await p.evaluate(()=>refreshFromFolder());
await p.waitForTimeout(800);
ok('unsaved typing survives a refresh', await val(p,'i-late')==='7', 'shows '+await val(p,'i-late'));
await save(p);
await comeBack(p);
ok('and it saved', await val(p,'i-late')==='7', 'shows '+await val(p,'i-late'));

console.log('\n6 — two people, one morning');
const q=await newPC('Marco');
await p.waitForTimeout(200);
ok('Marco sees Jehnae’s 52 jobs', await val(q,'i-jobs')==='52', 'shows '+await val(q,'i-jobs'));
await type(q,'i-shorts','3');
await save(q);
await type(p,'i-otd','96.4');
await save(p);
await comeBack(p);
ok('Jehnae’s OTD survived',  await val(p,'i-otd')==='96.4',  'shows '+await val(p,'i-otd'));
ok('Marco’s shorts survived', await val(p,'i-shorts')==='3', 'shows '+await val(p,'i-shorts'));

console.log('\n7 — Marco edits Jehnae’s comment while she is looking at it');
await q.evaluate(()=>{
  const c=(COMMENTS.shipping||[])[0];
  c.text='Four trucks late out of Dock 3'; c.edited=true; c.editedAt=Date.now();
  stashComments(); renderComments();
});
await save(q);
await p.evaluate(()=>refreshFromFolder());
await p.waitForTimeout(800);
texts = await p.evaluate(()=>(COMMENTS.shipping||[]).map(c=>c.text));
ok('Jehnae sees the newer wording', texts.includes('Four trucks late out of Dock 3'), JSON.stringify(texts));

console.log('\n8 — the edit dialog, through the buttons, with the folder moving underneath');
// This is the real sequence: click Edit, and while the box is open somebody else saves.
// The old code held the comment object it found when the buttons were drawn; the refresh
// replaced it, and the edit went into an orphan nobody could see.
await p.evaluate(()=>addComment('staffing','Angie: off Thursday'));
await p.evaluate(()=>addComment('staffing','Ilyas: off Friday'));
await p.waitForTimeout(200);
await save(p);
await q.evaluate(()=>refreshFromFolder()); await q.waitForTimeout(600);
// Jehnae opens the edit box on the first staffing note
await p.click('[data-thread="staffing"] .msg:first-child [data-edit]');
await p.waitForTimeout(200);
ok('the edit box opened', await p.locator('.mdl-bg').count()>0);
// Marco saves a comment of his own while that box sits open
await q.evaluate(()=>addComment('staffing','Marco: covering Thursday'));
await q.waitForTimeout(200);
await save(q);
await p.evaluate(()=>refreshFromFolder());   // the fifteen-second tick, mid-dialog
await p.waitForTimeout(700);
// Jehnae finishes typing and presses Save in the box
await p.evaluate(()=>{
  const ta=document.querySelector('.mdl-bg textarea,.mdl-bg input[data-f="t"]');
  ta.value='Angie: off Thursday and Friday';
  ta.dispatchEvent(new Event('input',{bubbles:true}));
});
await p.click('.mdl-bg [data-ok]');
await p.waitForTimeout(400);
texts = await p.evaluate(()=>(COMMENTS.staffing||[]).map(c=>c.text));
ok('the edit survived the refresh', texts.includes('Angie: off Thursday and Friday'), JSON.stringify(texts));
// Marco's comment is deliberately NOT here yet: the page holds the folder off while a
// dialog is open rather than redrawing under it. It arrives the moment the box closes.
await p.evaluate(()=>refreshFromFolder()); await p.waitForTimeout(700);
texts = await p.evaluate(()=>(COMMENTS.staffing||[]).map(c=>c.text));
ok('Marco’s comment arrives once the box is closed', texts.includes('Marco: covering Thursday'), JSON.stringify(texts));
await save(p);
await comeBack(p);
texts = await p.evaluate(()=>(COMMENTS.staffing||[]).map(c=>c.text));
ok('and it is in the shared file', texts.includes('Angie: off Thursday and Friday'), JSON.stringify(texts));

console.log('\n9 — deleting the note you pointed at, not the one that slid into its place');
await q.evaluate(()=>refreshFromFolder()); await q.waitForTimeout(600);
const target = await p.evaluate(()=>(COMMENTS.staffing||[])[0].text);
await p.evaluate(()=>{
  // pretend the list re-sorted under us, the way an incoming comment does
  const l=COMMENTS.staffing; l.unshift(l.pop());
});
await p.evaluate(t=>{
  const id=(COMMENTS.staffing||[]).find(c=>c.text===t).id;
  document.querySelector(`[data-del="staffing|${id}"]`).click();
}, target);
await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('.mdl-bg [data-ok]')?.click());
await p.waitForTimeout(300);
texts = await p.evaluate(()=>(COMMENTS.staffing||[]).map(c=>c.text));
ok('the right one went', !texts.includes(target), 'wanted '+JSON.stringify(target)+' gone, left '+JSON.stringify(texts));

console.log('\n10 — an old copy of the page notices it is old');
const stale = await p.evaluate(()=>{
  const was=STALE; STALE=false;
  noteBuild({build:BUILD+5});
  const said=!!document.querySelector('.mdl-bg');
  document.querySelector('.mdl-bg')?.remove();
  const flagged=STALE; STALE=was;
  return {said, flagged};
});
ok('a newer build in the folder is called out', stale.said && stale.flagged, JSON.stringify(stale));

console.log('\n11 — production figures, which live outside the fixed field list');
const dept = await p.evaluate(()=>{
  const out={};
  document.querySelectorAll('[id^="i-dept-"],[id^="i-pw-"]').forEach((e,i)=>{
    e.value=String(1000+i*7);
    e.dispatchEvent(new Event('input',{bubbles:true}));
    e.dispatchEvent(new Event('change',{bubbles:true}));
    out[e.id]=e.value;
  });
  return out;
});
ok('there are production boxes to fill', Object.keys(dept).length>0, Object.keys(dept).length+' boxes');
await save(p);
await comeBack(p);
let back = await p.evaluate(ids=>Object.fromEntries(
  ids.map(i=>[i,document.getElementById(i)?.value ?? '(gone)'])), Object.keys(dept));
let bad = Object.entries(dept).filter(([k,v])=>back[k]!==v);
ok('every production box came back', !bad.length,
   bad.length?bad.slice(0,4).map(([k,v])=>k+' saved '+v+' shows '+back[k]).join(', '):'');

console.log('\n12 — the same production figures seen from the other PC');
await q.evaluate(()=>refreshFromFolder()); await q.waitForTimeout(800);
back = await q.evaluate(ids=>Object.fromEntries(
  ids.map(i=>[i,document.getElementById(i)?.value ?? '(gone)'])), Object.keys(dept));
bad = Object.entries(dept).filter(([k,v])=>back[k]!==v);
ok('Marco sees them too', !bad.length,
   bad.length?bad.slice(0,4).map(([k,v])=>k+' saved '+v+' shows '+back[k]).join(', '):'');

console.log('\n13 — a number typed while the other PC is saving');
await type(q,'i-otif','97.5');
await save(q);                                   // Marco's save lands in the folder
await type(p,'i-mtdotif','88.8');                // Jehnae types, has not saved
await p.evaluate(()=>refreshFromFolder());       // the tick brings Marco's in
await p.waitForTimeout(800);
ok('Jehnae’s untyped box took Marco’s OTIF', await val(p,'i-otif')==='97.5', 'shows '+await val(p,'i-otif'));
ok('Jehnae’s own typing is untouched',      await val(p,'i-mtdotif')==='88.8', 'shows '+await val(p,'i-mtdotif'));
await save(p);
await comeBack(p);
ok('and it saved',        await val(p,'i-mtdotif')==='88.8', 'shows '+await val(p,'i-mtdotif'));
ok('without losing Marco’s', await val(p,'i-otif')==='97.5',  'shows '+await val(p,'i-otif'));

console.log('\n14 — the maintenance table');
await p.evaluate(()=>{
  maintRows=[{dept:'Printing',type:'Preventive',when:'2026-08-26',status:'Scheduled'}];
  buildMaintTable(false);
});
await save(p);
await comeBack(p);
const rows = await p.evaluate(()=>JSON.stringify(maintRows));
ok('the maintenance row came back', rows.includes('Preventive'), rows);

console.log(fails ? `\n${fails} failed\n` : '\nall good\n');
await b.close();
process.exit(fails?1:0);
