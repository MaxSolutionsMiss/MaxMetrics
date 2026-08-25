// The boardroom PC. The write probe is refused; the question is what the page does about it.
//   A  probe refused, real saves fine  -> must still save (this is why hiding was wrong)
//   B  probe refused, real saves fail  -> must say so, keep the morning, hide nothing
import { chromium } from 'playwright';
const FILE='file:///home/user/MaxMetrics/docs/morning-dashboard/Morning_Dashboard.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

async function run(label, realWritesFail) {
  const DISK={};
  const p=await (await b.newContext({viewport:{width:1300,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.exposeFunction('_read', n=>DISK[n]??null);
  await p.exposeFunction('_write',(n,t)=>{DISK[n]=t;});
  await p.exposeFunction('_exists',n=>Object.prototype.hasOwnProperty.call(DISK,n));
  await p.goto(FILE); await p.waitForTimeout(1300);
  await p.evaluate(fail=>{
    localStorage.setItem(meKey,JSON.stringify({name:'Room','ini':'RM'}));
    window.__DIR = {
      name:'Boardroom',
      getDirectoryHandle(){return Promise.resolve(window.__DIR);},
      removeEntry: async()=>{},
      async getFileHandle(n,o){
        const probe = n.startsWith('.write-test-');
        const there = await window._exists(n);
        if(!there && !(o&&o.create)){const e=new Error('nope');e.name='NotFoundError';throw e;}
        return { createWritable: async()=>{
            if (probe || fail) { const e=new Error('read-only share'); e.name='NotAllowedError'; throw e; }
            return { write: async t=>{await window._write(n,t);}, close: async()=>{} };
          },
          getFile: async()=>({ text: async()=>window._read(n) }) };
      },
    };
  }, realWritesFail);
  // adoptFolder is the real path the boardroom PC takes on open
  await p.evaluate(async()=>{ await adoptFolder(window.__DIR); });
  await p.waitForTimeout(900);

  const vis = s => p.$eval(s, n=>getComputedStyle(n).display!=='none' && !n.classList.contains('hidden')).catch(()=>null);
  console.log(`\n── ${label}`);
  console.log('   Edit visible :', await vis('#editBtn'));
  console.log('   Save visible :', await vis('#draftBtn'));
  console.log('   body classes :', await p.evaluate(()=>document.body.className.trim()||'(none)'));
  await p.evaluate(()=>document.querySelector('.mdl-bg')?.remove());

  // add a comment and save, the way somebody would in the meeting
  await p.$eval('[data-thread="watch"] .say input', i=>{ i.value='Room: added in the meeting';
    i.dispatchEvent(new Event('input',{bubbles:true})); });
  await p.click('[data-thread="watch"] .say button'); await p.waitForTimeout(500);
  await p.click('#draftBtn'); await p.waitForTimeout(1100);

  const day = Object.keys(DISK).find(k=>/^\d{4}-/.test(k));
  console.log('   file written :', day || 'none');
  console.log('   told         :', (await p.$eval('#toast,.toast',n=>n.textContent.trim()).catch(()=>'(none)')));
  const m = await p.$$eval('.mdl-bg', n=>n.map(x=>x.textContent.replace(/\s+/g,' ').trim().slice(0,80)));
  console.log('   modal        :', m.length?m[0]:'none');
  console.log('   errors       :', errs.length?errs.slice(0,2):'none');
}

await run('A — probe refused, the share actually accepts writes', false);
await run('B — probe refused and real writes refused too', true);
await b.close();
