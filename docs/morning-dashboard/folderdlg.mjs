import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const p=await b.newPage({viewport:{width:1400,height:850},deviceScaleFactor:2});
p.on('pageerror',e=>say(false,'error: '+e.message));
await p.goto('file://'+process.cwd()+'/'+(process.argv[2]||'Morning_Dashboard.html'));
await p.waitForTimeout(1200);
const open=async()=>(await p.$$('.mdl-bg')).length;
await p.click('#editBtn'); await p.waitForTimeout(400);

await p.click('#draftBtn'); await p.waitForTimeout(400);
say(await open()===1,'no folder — Save stops');
let btns=await p.$$eval('.mdl-f .mdl-btn',n=>n.map(x=>x.textContent.trim()));
say(btns.join(' / ')==='Cancel / Choose the folder','only two ways out — '+btns.join(' / '));
say(!btns.some(t=>/anyway/i.test(t)),'no "save here anyway"');
let txt=await p.$eval('.mdl-bg',n=>n.textContent);
say(/Daily Morning Dashboard/.test(txt),'it suggests where the morning lives');
await p.screenshot({path:'shot_dlg_none.png'});

/* Cancel means nothing is written */
await p.click('[data-x]'); await p.waitForTimeout(300);
say(await open()===0,'Cancel closes it');
say(await p.evaluate(()=>!localStorage.getItem(STORE_KEY)
  ||!JSON.parse(localStorage.getItem(STORE_KEY))[document.getElementById('dashDate').value]),
  'and nothing was saved anywhere');

/* Whichever folder comes back is accepted. This used to insist on one named exactly
   "Data" and refuse everything else, which protected a single setup and blocked every
   other one — including simply trying the thing out somewhere first. The morning goes
   where it is pointed; whether everybody points at the same place is for the people to
   agree, not for this page to enforce. */
await p.evaluate(()=>{window.showDirectoryPicker=async()=>({name:'Downloads',
  getDirectoryHandle(){return Promise.resolve(this);},
  getFileHandle:()=>Promise.resolve({createWritable:async()=>({write:async()=>{},close:async()=>{}}),
    getFile:async()=>({text:async()=>'{}'})})});});
await p.click('#draftBtn'); await p.waitForTimeout(350);
await p.click('[data-ok]'); await p.waitForTimeout(800);
say(await open()===0,'any folder is accepted, not just one blessed name');
say(/Saved to Downloads/.test(await p.$eval('#toast',n=>n.textContent)),
    'and it says where it went — "'+(await p.$eval('#toast',n=>n.textContent)).trim()+'"');
await p.screenshot({path:'shot_dlg_any.png'});

/* pointing it somewhere else later works the same way */
await p.evaluate(()=>{window.showDirectoryPicker=async()=>({name:'Data',
  getDirectoryHandle(){return Promise.resolve(this);},
  getFileHandle:()=>Promise.resolve({createWritable:async()=>({write:async()=>{},close:async()=>{}}),
    getFile:async()=>({text:async()=>'{}'})})});});
await p.evaluate(async()=>{await chooseFolder(true);}); await p.waitForTimeout(800);
say(await open()===0,'changing folder needs no dialog');
await p.click('#draftBtn'); await p.waitForTimeout(700);
say(/Saved to Data/.test(await p.$eval('#toast',n=>n.textContent)),
    'and the morning saves — "'+(await p.$eval('#toast',n=>n.textContent)).trim()+'"');

/* from then on, no dialog */
await p.click('#draftBtn'); await p.waitForTimeout(600);
say(await open()===0,'and it never asks again on this PC');
/* A write that fails must never look like a save. The read has to succeed here —
   a read that fails is a different fault with its own message, and conflating the two
   was how a failed save used to pass for a good one. */
await p.evaluate(()=>{DIR={name:'Data',getDirectoryHandle(){return Promise.resolve(DIR)},
  getFileHandle:(n,o)=>(o&&o.create)
    ? Promise.reject(Object.assign(new Error('read-only'),{name:'NoModificationAllowedError'}))
    : Promise.reject(Object.assign(new Error('none'),{name:'NotFoundError'}))};});
await p.click('#draftBtn'); await p.waitForTimeout(900);
const t=await p.$eval('#toast',n=>n.textContent);
say(/NOT shared/i.test(t),'a failed write says so loudly — "'+t.trim()+'"');
say(/this PC/i.test(t),'and says where the morning did end up — "'+t.trim()+'"');
/* and the reason is on screen, not only in the console */
const why=await p.$$eval('.mdl-bg',g=>g.length?g[g.length-1].textContent.replace(/\s+/g,' '):'');
say(/on this PC/i.test(why)&&/nothing has been lost/i.test(why),'a dialog says nothing was lost');
say(/Error|refused|allow/i.test(why),'and names what the browser actually reported');
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n'); process.exit(bad?1:0);
