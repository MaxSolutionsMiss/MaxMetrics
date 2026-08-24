/* A whole morning: type it, Save, wipe the browser, read it back out of the
   folder — using a fake folder that behaves like a real one. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(ok,t)=>{console.log((ok?'  ok   ':'  FAIL ')+t);if(!ok)bad++;};
const p=await b.newPage({viewport:{width:1500,height:950}});
p.on('pageerror',e=>say(false,'page error: '+e.message));
await p.goto('file://'+process.cwd()+'/'+(process.argv[2]||'Mississauga_Morning_Dashboard.html'));
await p.waitForTimeout(1200);

/* a folder that actually keeps what is written to it */
await p.evaluate(()=>{
  window.FAKE={};
  DIR={name:'Data',
    getDirectoryHandle(){return Promise.resolve(DIR);},
    getFileHandle(n,o){
      if(!(n in window.FAKE)&&!(o&&o.create))return Promise.reject(new Error('not found'));
      return Promise.resolve({
        createWritable:async()=>({write:async t=>{window.FAKE[n]=t;},close:async()=>{}}),
        getFile:async()=>({text:async()=>window.FAKE[n]})});
    }};
  localStorage.setItem(meKey,JSON.stringify({name:'Angela Wu',ini:'AW'}));
});

/* type a morning */
await p.click('#editBtn'); await p.waitForTimeout(500);
await p.fill('#i-short','3');
await p.fill('#i-jobs','41');
await p.fill('#i-late','2');
await p.$eval('[data-thread="watch"] .say input',i=>i.value='Board for the 40 is short');
await p.click('[data-thread="watch"] .say button'); await p.waitForTimeout(250);
await p.click('#draftBtn'); await p.waitForTimeout(600);

const date=await p.$eval('#dashDate',n=>n.value);
const files=await p.evaluate(()=>Object.keys(window.FAKE));
say(files.includes(date+'.json'),`the folder now holds ${date}.json — ${JSON.stringify(files)}`);
const onDisk=JSON.parse(await p.evaluate(d=>window.FAKE[d+'.json'],date));
say(onDisk.short==='3'&&onDisk.jobs==='41'&&onDisk.late==='2',
    `the numbers are in the file (shortages ${onDisk.short}, shipped ${onDisk.jobs}, late ${onDisk.late})`);
say(onDisk.comments?.watch?.[0]?.text==='Board for the 40 is short','the comment is in the file');
say(onDisk.comments.watch[0].ini==='AW','signed with the initials');
say(onDisk.status==='saved','marked saved, not a draft — nothing here was ever private');
say(!!onDisk.savedAt,'and stamped with when — '+onDisk.savedAt);

/* saving again lands on the same file rather than making a second one */
await p.fill('#i-jobs','44');
await p.click('#draftBtn'); await p.waitForTimeout(600);
say((await p.evaluate(()=>Object.keys(window.FAKE))).filter(k=>/^\d{4}-\d\d-\d\d\.json$/.test(k)).length===1,
    'a second save overwrites the same file rather than making another');
const again=JSON.parse(await p.evaluate(d=>window.FAKE[d+'.json'],date));
say(again.jobs==='44','with the newer number');
say(again.comments?.watch?.length===1,'and the comment still on it');
await p.fill('#i-jobs','41'); await p.click('#draftBtn'); await p.waitForTimeout(600);

/* wipe this browser entirely, reload, and pull the morning back from the folder */
await p.evaluate(()=>{const keep=window.FAKE;localStorage.clear();window.__keep=keep;});
await p.evaluate(()=>{window.name=JSON.stringify(window.__keep);});   // survive reload
await p.reload(); await p.waitForTimeout(1300);
await p.evaluate(async()=>{
  window.FAKE=JSON.parse(window.name);
  DIR={name:'Data',
    getDirectoryHandle(){return Promise.resolve(DIR);},
    getFileHandle(n,o){
      if(!(n in window.FAKE)&&!(o&&o.create))return Promise.reject(new Error('not found'));
      return Promise.resolve({
        createWritable:async()=>({write:async t=>{window.FAKE[n]=t;},close:async()=>{}}),
        getFile:async()=>({text:async()=>window.FAKE[n]})});
    }};
  await pullLayout(); await pullFromFolder();
});
await p.waitForTimeout(800);
const back=await p.evaluate(()=>({
  short:document.getElementById('d-short')?.textContent.trim(),
  jobs:document.getElementById('d-jobs')?.textContent.trim(),
  late:document.getElementById('d-late')?.textContent.trim(),
  comment:document.querySelector('[data-thread="watch"] .msg-t')?.textContent,
  who:document.querySelector('[data-thread="watch"] .msg-m')?.textContent,
}));
console.log('   read back from the folder:',JSON.stringify(back));
say(back.short==='3'&&back.jobs==='41'&&back.late==='2','a clean browser reads the numbers back');
say(back.comment==='Board for the 40 is short'&&/^Angela · /.test(back.who||''),
    'and the comment, still signed — "'+back.who+'"');
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nthe whole round trip holds\n');
process.exit(bad?1:0);
