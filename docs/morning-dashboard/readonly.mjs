/* The boardroom PC: the folder reads perfectly and refuses every write. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const URL='file://'+process.cwd()+'/Toronto_Morning_Dashboard.html';

/* A folder that hands over files happily and throws the named error on any
   attempt to write — which is exactly what a read-only share does. */
async function open(errName){
  const c=await b.newContext({viewport:{width:1500,height:950}});
  const p=await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1300);
  await p.evaluate(name=>{
    window.__FS={};
    const boom=()=>{const e=new Error('refused'); e.name=name; throw e;};
    DIR={name:'Data',
      getDirectoryHandle(){return Promise.resolve(DIR);},
      removeEntry(){return Promise.resolve();},
      getFileHandle(n,o){
        if(!(n in window.__FS)&&!(o&&o.create))return Promise.reject(new Error('none'));
        return Promise.resolve({
          createWritable:async()=>boom(),
          getFile:async()=>({text:async()=>window.__FS[n]})});
      }};
  },errName);
  return {p,errs};
}
const dlgText=p=>p.$$eval('.mdl-bg',g=>g.length?g[g.length-1].textContent.replace(/\s+/g,' '):'');

console.log('\n── Windows says no: the share is read-only ──');
let {p,errs}=await open('NoModificationAllowedError');
await p.$eval('[data-thread="priorities"] .say input',i=>i.value='Get the 40 back up');
await p.click('[data-thread="priorities"] .say button'); await p.waitForTimeout(300);
await p.$$eval('.mdl-bg',g=>{const m=g[g.length-1];
  m.querySelector('[data-f="name"]').value='Angela Wu';
  m.querySelector('[data-f="ini"]').value='AW'; m.querySelector('[data-ok]').click();});
await p.waitForTimeout(300);
await p.click('#draftBtn'); await p.waitForTimeout(900);
let t=await dlgText(p);
say(/Windows refused the write/.test(t),'it names Windows, not the browser');
say(/Modify rights/.test(t),'and says what to ask for — "'+(t.match(/Modify rights[^.]*/)||[''])[0]+'"');
say(/saved on this PC/i.test(t),'it says nothing was lost');
say(/NoModificationAllowedError/.test(t),'and prints what Chrome actually called it');
say(!(await p.$eval('body',n=>n.classList.contains('pres-mode'))),
    'the screen did NOT go into presentation mode');
say((await p.$eval('#statusBadge',n=>n.textContent))==='On this PC only',
    'and the badge says so rather than "Published"');
say((await p.$$('[data-thread="priorities"] .msg')).length===1,'the comment is still on screen');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await p.context().close();

console.log('\n── Chrome policy blocks writing ──');
({p,errs}=await open('NotAllowedError'));
await p.click('#draftBtn'); await p.waitForTimeout(900);
t=await dlgText(p);
say(/Chrome would not allow/.test(t),'it points at Chrome');
say(/chrome:\/\/policy/.test(t),'and tells them where to look');
say(/FileSystemWriteBlockedForUrls/.test(t),'naming the policy to look for');
await p.context().close();

console.log('\n── the Z: drive is not mapped ──');
({p,errs}=await open('NotFoundError'));
await p.click('#draftBtn'); await p.waitForTimeout(900);
t=await dlgText(p);
say(/not there any more/.test(t),'it says the folder has gone');
say(/not mapped/.test(t),'and suggests the mapped drive');
await p.context().close();

console.log('\n── something nobody has seen before ──');
({p,errs}=await open('WeirdUnheardOfError'));
await p.click('#draftBtn'); await p.waitForTimeout(900);
t=await dlgText(p);
say(/WeirdUnheardOfError/.test(t),'an unknown fault still gets named rather than swallowed');
say(/saved on this PC/i.test(t),'and still says the work is safe');
await p.context().close();

console.log('\n── a folder that works is left alone ──');
const c=await b.newContext({viewport:{width:1500,height:950}});
const q=await c.newPage(); const qerr=[]; q.on('pageerror',e=>qerr.push(e.message));
await q.goto(URL); await q.waitForTimeout(1300);
await q.evaluate(()=>{ window.__FS={};
  DIR={name:'Data',getDirectoryHandle(){return Promise.resolve(DIR);},
    removeEntry(n){delete window.__FS[n];return Promise.resolve();},
    getFileHandle(n,o){ if(!(n in window.__FS)&&!(o&&o.create))return Promise.reject(new Error('none'));
      return Promise.resolve({
        createWritable:async()=>({write:async t=>{window.__FS[n]=t;},close:async()=>{}}),
        getFile:async()=>({text:async()=>window.__FS[n]})}); }};
});
await q.click('#draftBtn'); await q.waitForTimeout(900);
say((await q.$$('.mdl-bg')).length===0,'no warning when the write succeeds');
say(!(await q.$eval('body',n=>n.classList.contains('pres-mode'))),
    'saving shares the day without jumping to the wall — that is what Present is for');
say(/^Saved /.test(await q.$eval('#statusBadge',n=>n.textContent)),
    'and the badge says when — "'+await q.$eval('#statusBadge',n=>n.textContent)+'"');
const wrote=await q.evaluate(()=>Object.keys(window.__FS));
say(wrote.some(k=>/^\d{4}-\d\d-\d\d\.json$/.test(k)),'the morning reached the folder — '+wrote.join(', '));
say(!wrote.some(k=>k.startsWith('.write-test')),'and the test file was cleared away');
say(qerr.length===0,'no errors'+(qerr.length?': '+qerr.join(' | '):''));
await c.close();

await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
