/* The bug the plant hit: whoever saved first never saw anything added after. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const DISK={};
async function person(name,ini){
  const ctx=await b.newContext({viewport:{width:1300,height:850}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>say(false,name+' error: '+e.message));
  await p.exposeFunction('_read', n=>DISK[n]??null);
  await p.exposeFunction('_write',(n,t)=>{DISK[n]=t;});
  await p.goto('file://'+process.cwd()+'/'+(process.argv[2]||'Morning_Dashboard.html'));
  await p.waitForTimeout(1200);
  await p.evaluate(({name,ini})=>{
    localStorage.setItem(meKey,JSON.stringify({name,ini}));
    DIR={name:'Data', getDirectoryHandle(){return Promise.resolve(DIR);},
      async getFileHandle(n,o){ const cur=await window._read(n);
        /* Chrome signals an absent file with NotFoundError, and the dashboard now tells
           that apart from a read that failed. A generic Error here would be read as a
           broken drive and the save would correctly refuse. */
        if(cur===null&&!(o&&o.create)){const e=new Error('none');e.name='NotFoundError';throw e;}
        return {createWritable:async()=>({write:async t=>{await window._write(n,t);},close:async()=>{}}),
                getFile:async()=>({text:async()=>window._read(n)})};}};
  },{name,ini});
  return p;
}
const comment=async(p,th,t)=>{ await p.$eval(`[data-thread="${th}"] .say input`,(i,t)=>i.value=t,t);
  await p.click(`[data-thread="${th}"] .say button`); await p.waitForTimeout(250); };
const seen=(p,th)=>p.$$eval(`[data-thread="${th}"] .msg-t`,n=>n.map(x=>x.textContent));

const jack=await person('Jack','JR'), mary=await person('Mary','MO');

console.log('\n── Save works without Edit Mode ──');
say(await jack.$eval('#draftBtn',n=>!n.classList.contains('hidden')),'Save is there before Edit Mode');
say(await jack.$eval('#showBtn',n=>!n.classList.contains('hidden')),'and so is Present');
await comment(jack,'watch','Jack: board short on the 40');
await jack.click('#draftBtn'); await jack.waitForTimeout(700);
say(!!DISK[Object.keys(DISK).find(k=>/\d{4}-/.test(k))],'a comment can be saved without Edit Mode at all');

console.log('\n── the colleague’s comment finds its way back ──');
await comment(mary,'watch','Mary: gluer down til noon');
await mary.click('#draftBtn'); await mary.waitForTimeout(700);
say((await seen(mary,'watch')).length===2,'Mary, who saved second, sees both');
say((await seen(jack,'watch')).length===1,'Jack does not yet — he has not looked');
await jack.waitForTimeout(17000);
const j=await seen(jack,'watch');
say(j.length===2,'and within the quarter minute he has hers too — '+JSON.stringify(j));

console.log('\n── it does not interrupt somebody typing ──');
await mary.click('#editBtn'); await mary.waitForTimeout(300);
await mary.fill('#i-short','');
await mary.focus('#i-short');
await mary.type('#i-short','7',{delay:20});
await comment(jack,'staffing','Jack: two off on the gluer');
await jack.click('#draftBtn'); await jack.waitForTimeout(700);
await mary.waitForTimeout(17000);
const still=await mary.evaluate(()=>({v:document.getElementById('i-short').value,
  focused:document.activeElement.id}));
say(still.v==='7','what she was typing is untouched — "'+still.v+'"');
say(still.focused==='i-short','and the cursor is still in her box');
say((await seen(mary,'staffing')).length===1,'while his new comment arrived anyway');

console.log('\n── and her unsaved number still wins when she saves ──');
await mary.click('#draftBtn'); await mary.waitForTimeout(800);
const file=JSON.parse(DISK[Object.keys(DISK).find(k=>/\d{4}-/.test(k))]);
say(file.short==='7','the file has her 7 — a refresh did not make it look unchanged');
say(Object.keys(file.comments).sort().join()==='staffing,watch','and every thread is in it');
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n'); process.exit(bad?1:0);
