/* Everything that must be true before this file goes to anybody. */
import fs from 'fs'; import vm from 'vm'; import {chromium} from 'playwright';
const F=process.argv[2]||'Mississauga_Morning_Dashboard.html';
const s=fs.readFileSync(F,'utf8');
let bad=0; const say=(ok,t)=>{console.log((ok?'  ok   ':'  FAIL ')+t); if(!ok)bad++;};
const URL='file://'+process.cwd()+'/'+F;

console.log('\n── the file itself ──');
say(s.trimEnd().endsWith('</html>'),'the document closes with </html>');
say(!/<\/html</.test(s),'nothing was appended past </html>');
const blocks=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
blocks.forEach((b,i)=>{ try{ new vm.Script(b);}catch(e){ say(false,`script block ${i+1}: ${e.message}`);} });
say(true,`all ${blocks.length} script blocks parse`);
const have=new Set([...s.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
const miss=[...new Set([...s.matchAll(/getElementById\('([^']+)'\)\./g)].map(m=>m[1]))]
  .filter(id=>!have.has(id)&&id!=='folderBtn');
say(miss.length===0,'every id reached without a guard exists'+(miss.length?': '+miss.join(', '):''));

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const errs=[]; let page;
async function fresh(){
  const ctx=await b.newContext({viewport:{width:1500,height:950}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/ERR_CONNECTION|ERR_NAME/.test(m.text()))errs.push(m.text());});
  await p.goto(URL); await p.waitForTimeout(1300);
  await p.evaluate(()=>{ window.__FS=window.__FS||{};
    DIR={name:'Data', getDirectoryHandle(){return Promise.resolve(DIR);},
      getFileHandle(n,o){ if(!(n in window.__FS)&&!(o&&o.create))return Promise.reject(new Error('none'));
        return Promise.resolve({
          createWritable:async()=>({write:async t=>{window.__FS[n]=t;},close:async()=>{}}),
          getFile:async()=>({text:async()=>window.__FS[n]})}); }};
  });
  return p;
}
const openN=async p=>(await p.$$('.mdl-bg')).length;
const saveNow=async(p,btn)=>{ await p.click(btn); await p.waitForTimeout(600); };
const top=(p,sel)=>p.$$eval('.mdl-bg',(g,x)=>g[g.length-1].querySelector(x).click(),sel);
const fillTop=(p,sel,v)=>p.$$eval('.mdl-bg',(g,[x,v])=>{g[g.length-1].querySelector(x).value=v;},[sel,v]);

console.log('\n── the page as it opens ──');
let p=await fresh();
const secs=await p.evaluate(()=>sectionBands().map(x=>x.textContent.trim()));
say(secs.length===7,`${secs.length} sections on the page`);
say((await p.$$eval('.sec-gear',n=>n.length))===secs.length,'a gear for every section');
say((await p.$$('.sec-gear')).length>0 &&
    (await p.$$eval('.sec-gear',n=>n.filter(g=>g.offsetParent).length))===0,'no gears before Edit Mode');
say((await p.$$eval('.rail a',n=>n.length))===secs.length,'a rail icon for every section');

console.log('\n── Configure, section by section ──');
await p.click('#editBtn'); await p.waitForTimeout(500);
say((await p.$$eval('.sec-gear',n=>n.filter(g=>g.offsetParent).length))===secs.length,'every gear shows in Edit Mode');
for(let i=0;i<secs.length;i++){
  await p.$$eval('.sec-gear',(g,i)=>g[i].click(),i); await p.waitForTimeout(160);
  const rows=await p.$$eval('.cfg-row',n=>n.length).catch(()=>-1);
  const add =(await p.$$('.cfg-add')).length;
  say(rows>0&&add===1,`${secs[i]} — ${rows} cards, hide / reorder / rename / add`);
  await top(p,'[data-x]'); await p.waitForTimeout(90);
}
say((await openN(p))===0,'every panel closed cleanly');
await p.context().close();

console.log('\n── hide, add, rename — and a reload ──');
p=await fresh();
await p.click('#editBtn'); await p.waitForTimeout(500);
await p.$$eval('.sec-gear',g=>g[4].click()); await p.waitForTimeout(200);
await p.$$eval('.cfg-row input[type=checkbox]',c=>c[2].click()); await p.waitForTimeout(120);
await top(p,'[data-ok]'); await p.waitForTimeout(250);
await p.$$eval('.sec-gear',g=>g[4].click()); await p.waitForTimeout(200);
await top(p,'[data-add]'); await p.waitForTimeout(250);
await fillTop(p,'[data-f="name"]','Trailers waiting'); await fillTop(p,'[data-f="sub"]','at the dock');
await top(p,'[data-ok]'); await p.waitForTimeout(280); await top(p,'[data-ok]'); await p.waitForTimeout(250);
await p.$$eval('.sec-gear',g=>g[0].click()); await p.waitForTimeout(200);
await p.$$eval('.cfg-row [data-rn]',n=>n[0].click()); await p.waitForTimeout(220);
await fillTop(p,'[data-f="name"]','Days Since Injury');
await top(p,'[data-ok]'); await p.waitForTimeout(220); await top(p,'[data-ok]'); await p.waitForTimeout(250);
await p.fill('[data-cin]','7');
await saveNow(p,'#draftBtn');
await p.reload(); await p.waitForTimeout(1400);
const a=await p.evaluate(()=>({
  added:[...document.querySelectorAll('[data-ckey]')].map(x=>x.querySelector('.c-lbl')?.textContent),
  val:document.querySelector('[data-cval]')?.textContent,
  ship:[...document.querySelectorAll('.ship-cell')].filter(c=>c.offsetParent).length,
  inj:document.querySelector('#c-inj .c-lbl')?.textContent,
  gears:document.querySelectorAll('.sec-gear').length, rail:document.querySelectorAll('.rail a').length}));
say(a.added.join()==='Trailers waiting','the added card came back');
say(a.val==='7','what was typed into it came back');
say(a.ship===7,'the hidden shipping cell is still hidden');
say(a.inj==='Days Since Injury','the rename stuck');
say(a.gears===7&&a.rail===7,'gears and rail rebuilt');
await p.context().close();

console.log('\n── comments ──');
p=await fresh();
await p.$eval('[data-thread="priorities"] .say input',i=>i.value='Get the 30 back up');
await p.click('[data-thread="priorities"] .say button'); await p.waitForTimeout(300);
say((await openN(p))===1,'the first comment asks who is speaking');
await fillTop(p,'[data-f="name"]','Angela Wu'); await fillTop(p,'[data-f="ini"]','AW');
await top(p,'[data-ok]'); await p.waitForTimeout(300);
say((await p.$$('[data-thread="priorities"] .msg')).length===1,'the first comment landed');
await p.$eval('[data-thread="watch"] .say input',i=>i.value='Board for the 40 is short');
await p.click('[data-thread="watch"] .say button'); await p.waitForTimeout(300);
say((await openN(p))===0,'it does not ask a second time');
say((await p.$$('[data-thread="watch"] .msg')).length===1,'the second comment landed too');
await p.click('#editBtn'); await p.waitForTimeout(400);
await saveNow(p,'#pubBtn');
await p.reload(); await p.waitForTimeout(1400);
say((await p.$$('[data-thread="watch"] .msg')).length===1,'Publish keeps the comments');
await p.context().close();

console.log('\n── the rail ──');
p=await fresh();
await p.$$eval('.rail a',n=>n[3].click()); await p.waitForTimeout(900);
say(await p.evaluate(()=>window.scrollY>0),'clicking an icon moves the page');
await p.click('.rail-tuck'); await p.waitForTimeout(250);
say(await p.$eval('.rail',n=>n.classList.contains('tucked')),'« tucks it away');
await p.reload(); await p.waitForTimeout(1300);
say(await p.$eval('.rail',n=>n.classList.contains('tucked')),'and it stays tucked');
await p.context().close();

say(errs.length===0,'no errors anywhere'+(errs.length?': '+errs.join(' | '):''));
await b.close();
console.log(bad?`\n${bad} check(s) failed\n`:'\nall checks passed\n');
process.exit(bad?1:0);
