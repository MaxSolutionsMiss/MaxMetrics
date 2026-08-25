/* The second morning. Chrome has been closed overnight: it still knows which
   folder was picked, but no longer that this page may write to it. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const FILE=process.argv[2]||'Morning_Dashboard.html';

/* A remembered folder handle whose permission has lapsed to "ask". It only says
   yes to requestPermission, which is the whole point: Chrome allows that during
   a click and refuses it on page load. */
const SEED = (perm) => {
  window.__FS={'_layout.json':'{}'};
  window.__asked=0; window.__pickerOpened=0;
  const dir={ name:'Data', __perm:perm,
    queryPermission:async()=>dir.__perm,
    requestPermission:async()=>{ window.__asked++; dir.__perm='granted'; return 'granted'; },
    getDirectoryHandle:async()=>dir,
    removeEntry:async n=>{delete window.__FS[n];},
    values(){ const ns=Object.keys(window.__FS);
      return (async function*(){ for(const n of ns) yield {kind:'file',name:n}; })(); },
    getFileHandle:async(n,o)=>{ if(!(n in window.__FS)&&!(o&&o.create)) throw new Error('none');
      return { createWritable:async()=>({write:async t=>{window.__FS[n]=t;},close:async()=>{}}),
               getFile:async()=>({text:async()=>window.__FS[n]||'{}'}) }; } };
  window.__dir=dir;
  window.showDirectoryPicker=async()=>{ window.__pickerOpened++; return dir; };
  /* stand in for what IndexedDB hands back */
  window.idbGet=async()=>dir;
};

async function open(perm){
  const c=await b.newContext({viewport:{width:1500,height:950}});
  const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.cwd()+'/'+FILE);
  await p.waitForTimeout(1400);
  /* The page declares its own idbGet and showDirectoryPicker at load, so ours has
     to go in afterwards or the page's win. Then run the restore the way a fresh
     morning would. */
  await p.evaluate(SEED, perm);
  await p.evaluate(async()=>{ DIR=null; PENDING=null; await restoreFolder(); });
  await p.waitForTimeout(500);
  return {p,errs,c};
}
const bar = p => p.evaluate(()=>({
  cls:document.body.className.trim(),
  shown:getComputedStyle(document.getElementById('folderBar')).display,
  txt:document.getElementById('folderBar').textContent.replace(/\s+/g,' ').trim(),
  btn:document.getElementById('folderBtn')?.textContent.trim(),
  dir:typeof DIR!=='undefined'&&DIR?DIR.name:null }));

console.log('\n── the morning after: Chrome kept the folder, dropped the permission ──');
let {p,errs,c}=await open('prompt');
let st=await bar(p);
say(st.dir===null,'the folder is not in use yet');
say(await p.evaluate(()=>window.__asked===0),
    'and nothing demanded permission on load — which Chrome would have refused anyway');
say(/locked-folder/.test(st.cls),'the page says it is locked, not lost');
say(/Reconnect the shared folder/.test(st.txt),'and offers to reconnect — "'+st.txt.slice(0,52)+'…"');
say(/still knows which folder/.test(st.txt),'saying the folder is still known');
say(/Reconnect/.test(st.btn||''),'the header button agrees — "'+st.btn+'"');

console.log('\n── one click, and no file picker ──');
await p.$eval('.folderbar [data-choose]',n=>n.click());
await p.waitForTimeout(700);
st=await bar(p);
say(st.dir==='Data','the folder is in use — '+st.dir);
say(await p.evaluate(()=>window.__pickerOpened===0),
    'without the file picker ever opening');
say(await p.evaluate(()=>window.__asked===1),'permission was asked exactly once, inside the click');
say(st.shown==='none','and the bar has gone');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));

console.log('\n── and it saves, which is the whole point ──');
await p.evaluate(()=>{document.getElementById('dashDate').value='2026-08-21';});
await p.click('#draftBtn'); await p.waitForTimeout(800);
const wrote=await p.evaluate(()=>Object.keys(window.__FS));
say(wrote.includes('2026-08-21.json'),'the morning reached the folder — '+wrote.join(', '));
await c.close();

console.log('\n── a PC where permission was actually granted ──');
({p,errs,c}=await open('granted'));
st=await bar(p);
say(st.dir==='Data','it just works, with no bar and no click');
say(st.shown==='none','nothing on screen to do');
say(await p.evaluate(()=>window.__asked===0),'and nothing was asked');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await c.close();

console.log('\n── a PC that was told no ──');
({p,errs,c}=await open('denied'));
st=await bar(p);
say(st.dir===null,'the folder is not used');
say(/no-folder/.test(st.cls),'and it asks to be chosen properly rather than reconnected');
say(/Choose folder/.test(st.btn||''),'the button says Choose — "'+st.btn+'"');
await c.close();

await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
