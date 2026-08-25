/* What happens when the input is hostile, ancient, or absent. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const URL='file://'+process.cwd()+'/Morning_Dashboard.html';
const fresh=async()=>{const c=await b.newContext({viewport:{width:1600,height:1000}});
  const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1300); return {p,errs,c};};

console.log('\n── a comment that is trying something ──');
let {p,errs,c}=await fresh();
let popped=false; p.on('dialog',async d=>{popped=true;await d.dismiss();});
await p.evaluate(()=>{
  window.__pwned=false;
  localStorage.setItem(meKey,JSON.stringify({name:'A W',ini:'AW'}));
  COMMENTS={watch:[
    {id:'x1',ini:'<img src=x onerror="window.__pwned=true">',name:'<b>bold</b>',
     text:'<script>window.__pwned=true<\/script><img src=x onerror="window.__pwned=true">',
     when:'2026-08-20 7:41 AM'},
    {id:'x2',ini:'AW',name:'A W',text:'5 < 6 & 7 > 2 "quoted"',when:'2026-08-20 7:42 AM'}]};
  renderComments();
});
await p.waitForTimeout(500);
say(await p.evaluate(()=>window.__pwned)===false,'nothing in a comment ran as code');
say((await p.$$('[data-thread="watch"] img')).length===0,'and no tag was built out of one');
say(!popped,'no dialog was raised');
const shown=await p.$$eval('[data-thread="watch"] .msg-t',n=>n.map(x=>x.textContent));
say(shown[1]==='5 < 6 & 7 > 2 "quoted"','ordinary punctuation still reads as itself — '+shown[1]);
say(/script/.test(shown[0]),'and the attempt is shown as the text it is');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await c.close();

console.log('\n── a day file from an older copy of this page ──');
({p,errs,c}=await fresh());
const legacy=await p.evaluate(()=>{
  const date=document.getElementById('dashDate').value;
  const st=JSON.parse(localStorage.getItem(STORE_KEY)||'{}');
  /* no ids, no `deleted`, no `layout` — the shape saved before any of that existed */
  st[date]={injDate:'2026-07-08',short:'2',
    comments:{watch:[{ini:'DM',name:'Dave M',text:'From the old days',when:'2026-08-19 7:00 AM'}]}};
  localStorage.setItem(STORE_KEY,JSON.stringify(st));
  loadDay(); applyAll();
  return {msgs:document.querySelectorAll('[data-thread="watch"] .msg').length,
          text:document.querySelector('[data-thread="watch"] .msg-t')?.textContent,
          meta:document.querySelector('[data-thread="watch"] .msg-m')?.textContent};
});
say(legacy.msgs===1,'an old comment still loads');
say(legacy.text==='From the old days','and reads — "'+legacy.text+'"');
say(/19 Aug/.test(legacy.meta),'with its date shortened like any other — "'+legacy.meta+'"');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await c.close();

console.log('\n── a day file that is not a day file ──');
({p,errs,c}=await fresh());
const junk=await p.evaluate(()=>{
  try{
    localStorage.setItem(STORE_KEY,'{not json at all');
    loadDay(); applyAll();
    return {survived:true, cards:document.querySelectorAll('.card').length};
  }catch(e){ return {survived:false, why:e.message}; }
});
say(junk.survived,'a corrupted store does not take the page down'+(junk.why?': '+junk.why:''));
say(junk.cards>10,'and the morning still draws — '+junk.cards+' cards');
await c.close();

console.log('\n── printed ──');
({p,errs,c}=await fresh());
await p.evaluate(()=>{
  localStorage.setItem(meKey,JSON.stringify({name:'A W',ini:'AW'}));
  COMMENTS={priorities:[{id:'p',ini:'AW',name:'A W',text:'Get the gluer back up',when:'2026-08-20 7:52 AM'}]};
  renderComments(); document.body.classList.add('pres-mode');
});
await p.emulateMedia({media:'print'}); await p.waitForTimeout(300);
const pr=await p.evaluate(()=>{
  const vis=s=>[...document.querySelectorAll(s)].filter(e=>getComputedStyle(e).display!=='none').length;
  return {buttons:vis('.btn'), rail:vis('.rail'), say:vis('.say'), acts:vis('.msg-acts'),
          prio:document.querySelector('[data-thread="priorities"] .msg-t')?.textContent,
          wide:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};
});
say(pr.say===0&&pr.acts===0,'no boxes or buttons on the printed page');
say(pr.prio==='Get the gluer back up','what matters most is on it — "'+pr.prio+'"');
say(!pr.wide,'and it does not run off the side of the paper');
await p.emulateMedia({media:'screen'});
await c.close();

console.log('\n── the keyboard alone ──');
({p,errs,c}=await fresh());
const kb=await p.evaluate(async()=>{
  const inp=document.querySelector('[data-thread="watch"] .say input');
  inp.focus();
  const focused=document.activeElement===inp;
  const ring=getComputedStyle(inp,':focus-visible').outlineStyle;
  return {focused, ring};
});
say(kb.focused,'a comment box takes focus');
await p.keyboard.type('Typed with no mouse at all');
await p.keyboard.press('Enter'); await p.waitForTimeout(400);
const asked=(await p.$$('.mdl-bg')).length;
if(asked){ await p.$$eval('.mdl-bg',g=>{const m=g[g.length-1];
  m.querySelector('[data-f="name"]').value='Key Board';
  m.querySelector('[data-f="ini"]').value='KB'; m.querySelector('[data-ok]').click();});
  await p.waitForTimeout(400); }
say((await p.$$('[data-thread="watch"] .msg')).length===1,
    'and Enter posts the comment without touching Add');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await c.close();


console.log('\n── the folder bar ──');
{const {p,errs,c}=await fresh();
 const state=async()=>p.evaluate(()=>({cls:document.body.className.trim(),
   shown:getComputedStyle(document.getElementById('folderBar')).display,
   txt:document.getElementById('folderBar').textContent.replace(/\s+/g,' ').trim()}));
 let st=await state();
 say(st.shown!=='none','with no folder picked, a bar spans the page');
 say(/reach anybody/.test(st.txt),'and says the morning will reach nobody');
 say(/Morning Dashboard/.test(st.txt),'naming the folder to pick');
 await p.evaluate(()=>{DIR={name:'Downloads'};folderBadge();}); st=await state();
 say(st.cls==='wrong-folder','the wrong folder gets its own warning');
 say(/Downloads/.test(st.txt),'naming what was picked by mistake — "'+st.txt.slice(0,46)+'…"');
 await p.evaluate(()=>{DIR={name:'Data'};folderBadge();}); st=await state();
 say(st.shown==='none','and the bar goes the moment the right one is chosen');
 await p.emulateMedia({media:'print'}); await p.waitForTimeout(200);
 say((await state()).shown==='none','it is never printed');
 await p.emulateMedia({media:'screen'});
 say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
 await c.close();}

console.log('\n── a dialog that only has something to say ──');
{const {p,errs,c}=await fresh();
 await p.evaluate(()=>modal('Just telling you','<p class="mdl-p">Something happened.</p>',
   null,'I understand'));
 await p.waitForTimeout(200);
 say((await p.$$('.mdl-bg')).length===1,'it opens');
 await p.$$eval('.mdl-bg',g=>g[g.length-1].querySelector('[data-ok]').click());
 await p.waitForTimeout(250);
 say((await p.$$('.mdl-bg')).length===0,'and the button closes it with no handler to call');
 say(errs.length===0,'without throwing'+(errs.length?': '+errs.join(' | '):''));
 await c.close();}

await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
