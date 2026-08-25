import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const p=await b.newPage({viewport:{width:1400,height:850},deviceScaleFactor:2});
p.on('pageerror',e=>say(false,'error: '+e.message));
await p.goto('file://'+process.cwd()+'/'+(process.argv[2]||'Toronto_Morning_Dashboard.html'));
await p.waitForTimeout(1200);
const open=async()=>(await p.$$('.mdl-bg')).length;
await p.click('#editBtn'); await p.waitForTimeout(400);

await p.click('#draftBtn'); await p.waitForTimeout(400);
say(await open()===1,'no folder — Save stops');
let btns=await p.$$eval('.mdl-f .mdl-btn',n=>n.map(x=>x.textContent.trim()));
say(btns.join(' / ')==='Cancel / Choose the folder','only two ways out — '+btns.join(' / '));
say(!btns.some(t=>/anyway/i.test(t)),'no "save here anyway"');
let txt=await p.$eval('.mdl-bg',n=>n.textContent);
say(txt.includes('Morning Dashboard\\Data'),'it names the one right folder');
await p.screenshot({path:'shot_dlg_none.png'});

/* Cancel means nothing is written */
await p.click('[data-x]'); await p.waitForTimeout(300);
say(await open()===0,'Cancel closes it');
say(await p.evaluate(()=>!localStorage.getItem(STORE_KEY)
  ||!JSON.parse(localStorage.getItem(STORE_KEY))[document.getElementById('dashDate').value]),
  'and nothing was saved anywhere');

/* the picker lands on the wrong folder: it says so and stays put */
await p.evaluate(()=>{window.showDirectoryPicker=async()=>({name:'Downloads',
  getDirectoryHandle(){return Promise.resolve(this);},
  getFileHandle:()=>Promise.resolve({createWritable:async()=>({write:async()=>{},close:async()=>{}}),
    getFile:async()=>({text:async()=>'{}'})})});});
await p.click('#draftBtn'); await p.waitForTimeout(350);
await p.click('[data-ok]'); await p.waitForTimeout(600);
say(await open()===1,'picked the wrong folder — the dialog stays up');
txt=await p.$eval('.mdl-bg',n=>n.textContent);
say(/That is Downloads, not Data/.test(txt.replace(/\s+/g,' ')),'and tells them what they picked');
await p.screenshot({path:'shot_dlg_wrong.png'});

/* now the right one */
await p.evaluate(()=>{window.showDirectoryPicker=async()=>({name:'Data',
  getDirectoryHandle(){return Promise.resolve(this);},
  getFileHandle:()=>Promise.resolve({createWritable:async()=>({write:async()=>{},close:async()=>{}}),
    getFile:async()=>({text:async()=>'{}'})})});});
await p.click('[data-ok]'); await p.waitForTimeout(800);
say(await open()===0,'picking Data closes it');
say(/Saved to Data/.test(await p.$eval('#toast',n=>n.textContent)),
    'and the morning saves — "'+(await p.$eval('#toast',n=>n.textContent))+'"');

/* from then on, no dialog */
await p.click('#draftBtn'); await p.waitForTimeout(600);
say(await open()===0,'and it never asks again on this PC');
/* a write that fails must never look like a save */
await p.evaluate(()=>{DIR={name:'Data',getDirectoryHandle(){return Promise.resolve(DIR)},
  getFileHandle:()=>Promise.reject(new Error('read-only'))};});
await p.click('#draftBtn'); await p.waitForTimeout(700);
const t=await p.$eval('#toast',n=>n.textContent);
say(/NOT shared/i.test(t),'a failed write says so loudly — "'+t.trim()+'"');
say(/this PC/i.test(t),'and says where the morning did end up');
/* and the reason is on screen, not only in the console */
const why=await p.$$eval('.mdl-bg',g=>g.length?g[g.length-1].textContent.replace(/\s+/g,' '):'');
say(/saved on this PC/i.test(why),'a dialog says nothing was lost');
say(/Error|refused|allow/i.test(why),'and names what the browser actually reported');
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n'); process.exit(bad?1:0);
