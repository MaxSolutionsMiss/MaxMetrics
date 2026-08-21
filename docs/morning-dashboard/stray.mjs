/* The boardroom folder as it actually is: real mornings plus two Export backups. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const c=await b.newContext({viewport:{width:1500,height:950}});
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/'+(process.argv[2]||'Mississauga_Morning_Dashboard.html'));
await p.waitForTimeout(1400);

await p.evaluate(()=>{
  const names=['2026-08-17.json','2026-08-18.json','2026-08-19.json','2026-08-20.json',
               '2026-08-21.json','dashboard-2026-08-20.json','dashboard-2026-08-21.json'];
  window.__FS={}; names.forEach(n=>window.__FS[n]='{}');
  DIR={name:'Data',
    getDirectoryHandle(){return Promise.resolve(DIR);},
    values(){ return (async function*(){ for(const n of names) yield {kind:'file',name:n}; })(); },
    getFileHandle(n,o){ if(!(n in window.__FS)&&!(o&&o.create))return Promise.reject(new Error('none'));
      return Promise.resolve({createWritable:async()=>({write:async t=>{window.__FS[n]=t;},close:async()=>{}}),
        getFile:async()=>({text:async()=>window.__FS[n]})}); }};
});
await p.evaluate(()=>warnAboutStrays()); await p.waitForTimeout(400);
const t=await p.$$eval('.mdl-bg',g=>g.length?g[g.length-1].textContent.replace(/\s+/g,' '):'');
say(/Backups are sitting in the shared folder/.test(t),'the folder notices the backups');
say(/dashboard-2026-08-20\.json/.test(t)&&/dashboard-2026-08-21\.json/.test(t),
    'and names both of them');
say(!/[^-]2026-08-19\.json/.test(t),'without accusing the real mornings');
say(/nobody reads them/i.test(t),'it says plainly that nothing reads them');
say(/Import/.test(t),'and how to bring one in if it is needed');
say(/Nothing is lost/i.test(t),'while saying nothing is lost');
await p.$$eval('.mdl-bg',g=>g[g.length-1].querySelector('[data-ok]').click());
await p.waitForTimeout(250);
await p.evaluate(()=>warnAboutStrays()); await p.waitForTimeout(300);
say((await p.$$('.mdl-bg')).length===0,'and it does not nag twice in one sitting');

/* a clean folder says nothing at all */
await p.evaluate(()=>{ strayTold=false;
  const names=['2026-08-20.json','2026-08-21.json','_layout.json'];
  DIR.values=()=>(async function*(){for(const n of names) yield {kind:'file',name:n};})(); });
await p.evaluate(()=>warnAboutStrays()); await p.waitForTimeout(300);
say((await p.$$('.mdl-bg')).length===0,'a tidy folder is left in peace');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
