/* The boardroom PC: it can read Z:\Morning Dashboard\Data and Windows will not
   let it write a single byte. It should still be able to run the meeting. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const FILE=process.argv[2]||'Mississauga_Morning_Dashboard.html';

/* The shared folder as the plant left it, and a drive that refuses every write. */
const SEED = (canWrite) => {
  const morning = JSON.stringify({
    short:'2', comments:{ priorities:[{id:'p1',ini:'AW',name:'Angela Wu',
      text:'Get the gluer back up before second shift.',when:'2026-08-21 7:52 AM'}] }});
  window.__FS={'2026-08-21.json':morning,'_layout.json':'{}'};
  window.__writes=0;
  const boom=()=>{const e=new Error('refused'); e.name='NoModificationAllowedError'; throw e;};
  const dir={ name:'Data',
    queryPermission:async()=>'granted', requestPermission:async()=>'granted',
    getDirectoryHandle:async()=>dir,
    removeEntry:async n=>{ if(!canWrite) boom(); delete window.__FS[n]; },
    values(){ const ns=Object.keys(window.__FS);
      return (async function*(){ for(const n of ns) yield {kind:'file',name:n}; })(); },
    getFileHandle:async(n,o)=>{ if(!(n in window.__FS)&&!(o&&o.create)) throw new Error('none');
      return { createWritable:async()=>{ if(!canWrite) boom();
                 return {write:async t=>{window.__writes++;window.__FS[n]=t;},close:async()=>{}}; },
               getFile:async()=>({text:async()=>window.__FS[n]||'{}'}) }; } };
  window.idbGet=async()=>dir;
};

async function open(canWrite){
  const c=await b.newContext({viewport:{width:1500,height:950}});
  const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.cwd()+'/'+FILE);
  await p.waitForTimeout(1400);
  await p.evaluate(SEED, canWrite);
  await p.evaluate(async()=>{ DIR=null; PENDING=null; await restoreFolder(); });
  await p.waitForTimeout(700);
  /* clear whatever the arrival dialogs put up */
  await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
  return {p,errs,c};
}
const shown = s => p => p.$$eval(s,n=>n.filter(x=>getComputedStyle(x).display!=='none').length);

console.log('\n── it arrives and works out what it is ──');
let {p,errs,c}=await open(false);
say(await p.$eval('body',n=>n.classList.contains('display-only')),
    'a PC that cannot write knows it is a screen');
say(await shown('#draftBtn')(p)===0 && await shown('#pubBtn')(p)===0,
    'Save and Publish are gone');
say(await shown('#editBtn')(p)===0,'and so is Edit Mode');
say(await shown('#showBtn')(p)===1,'Present is still there — the one thing it can do');

console.log('\n── Present, on a folder it may not write to ──');
/* the room picks the day it wants to look at */
await p.evaluate(()=>{document.getElementById('dashDate').value='2026-08-21';});
await p.click('#showBtn'); await p.waitForTimeout(900);
say(await p.evaluate(()=>window.__writes===0),
    'presenting wrote nothing at all — '+await p.evaluate(()=>window.__writes)+' writes');
say((await p.$$('.mdl-bg')).length===0,'and raised no complaint');
say(await p.$eval('body',n=>n.classList.contains('pres-mode')),'it is on the wall');
const prio=await p.$eval('[data-thread="priorities"] .msg-t',n=>n.textContent.trim());
say(prio==='Get the gluer back up before second shift.',
    'showing the morning somebody else published — "'+prio+'"');
say((await p.$eval('#statusBadge',n=>n.textContent)).includes('shared'),
    'and it says so — "'+await p.$eval('#statusBadge',n=>n.textContent)+'"');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));

console.log('\n── a different day, still no writing ──');
await p.evaluate(()=>{ window.__FS['2026-08-20.json']=JSON.stringify({comments:{priorities:
  [{id:'q',ini:'DM',name:'Dave M',text:'Yesterday: clear the short board.',when:'2026-08-20 7:50 AM'}]}});
  document.getElementById('dashDate').value='2026-08-20'; });
await p.click('#showBtn'); await p.waitForTimeout(900);
say((await p.$eval('[data-thread="priorities"] .msg-t',n=>n.textContent)).includes('Yesterday'),
    'yesterday pulls up too — "'+await p.$eval('[data-thread="priorities"] .msg-t',n=>n.textContent.trim())+'"');
say(await p.evaluate(()=>window.__writes===0),'and still nothing written');

console.log('\n── the wall stays up while the plant keeps saving ──');
/* the fifteen-second refresh, and a colleague adding a comment mid-meeting */
await p.evaluate(async()=>{
  window.__FS['2026-08-20.json']=JSON.stringify({comments:{priorities:[
    {id:'q',ini:'DM',name:'Dave M',text:'Yesterday: clear the short board.',when:'2026-08-20 7:50 AM'},
    {id:'r',ini:'JR',name:'Javad Resa',text:'Added while the meeting was running.',when:'2026-08-20 8:05 AM'}]}});
  await refreshFromFolder();
});
await p.waitForTimeout(600);
say(await p.$eval('body',n=>n.classList.contains('pres-mode')),
    'a refresh mid-meeting does not drop the wall');
say((await p.$$('[data-thread="priorities"] .msg')).length===2,
    'and the new comment appears on it — '+(await p.$$('[data-thread="priorities"] .msg')).length+' notes');
say(await shown('.say')(p)===0,'with no boxes or buttons coming back');
say(await p.evaluate(()=>window.__writes===0),'still nothing written');

await c.close();



console.log('\n── a plant-floor PC that can write is untouched ──');
({p,errs,c}=await open(true));
say(!(await p.$eval('body',n=>n.classList.contains('display-only'))),'it is not a screen');
say(await shown('#draftBtn')(p)===1 && await shown('#pubBtn')(p)===1,'Save and Publish are there');
say(await shown('#showBtn')(p)===1,'and Present beside them');
await p.evaluate(()=>{document.getElementById('dashDate').value='2026-08-21';});
await p.click('#pubBtn'); await p.waitForTimeout(900);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
say(await p.evaluate(()=>window.__writes>0),
    'publishing writes — '+await p.evaluate(()=>window.__writes)+' writes');
say(await p.$eval('body',n=>n.classList.contains('pres-mode')),'and puts it on the wall');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await c.close();

await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
