import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(ok,t)=>{console.log((ok?'  ok   ':'  FAIL ')+t); if(!ok)bad++;};
const URL='file://'+process.cwd()+'/'+(process.argv[2]||'Morning_Dashboard.html');
const top=(p,s)=>p.$$eval('.mdl-bg',(g,x)=>g[g.length-1].querySelector(x).click(),s);
const setTop=(p,s,v)=>p.$$eval('.mdl-bg',(g,[x,v])=>{g[g.length-1].querySelector(x).value=v;},[s,v]);
const openN=async p=>(await p.$$('.mdl-bg')).length;
async function fresh(){const c=await b.newContext({viewport:{width:1500,height:950}});
  const p=await c.newPage(); p.on('pageerror',e=>{say(false,'page error: '+e.message);});
  await p.goto(URL); await p.waitForTimeout(1200); return p;}

console.log('\n── editing comments ──');
let p=await fresh();
await p.evaluate(()=>localStorage.setItem(meKey,JSON.stringify({name:'Angela Wu',ini:'AW'})));
await p.evaluate(()=>{COMMENTS={watch:[
  {ini:'AW',name:'Angela Wu',text:'Board for the 40 is short',when:'2026-08-19 7:41 AM'},
  {ini:'DM',name:'Dave M',   text:'Glur down til noon',        when:'2026-08-19 7:44 AM'}]};
  renderComments();});
say(!(await p.$eval('#editBtn',n=>n.classList.contains('hidden'))),
    'Edit Mode is OFF for everything that follows');
const links=await p.$$eval('[data-thread="watch"] .msg',n=>n.map(m=>
  [...m.querySelectorAll('.msg-acts .msg-btn')].map(x=>x.textContent.trim()).join('+')));
say(links.length===2&&links.every(l=>/Edit\+.*Delete/.test(l)),
    'edit and delete on both comments, mine and somebody else’s — got '+JSON.stringify(links));

/* edit my own */
await p.$$eval('[data-thread="watch"] [data-edit]',n=>n[0].click()); await p.waitForTimeout(250);
say((await p.$$('.mdl-bg textarea')).length===1,'the edit box is a textarea, not a one-liner');
await setTop(p,'textarea','Board for the 40 is short — Dave chasing it');
await top(p,'[data-ok]'); await p.waitForTimeout(250);
const first=await p.$eval('[data-thread="watch"] .msg .msg-t',n=>n.textContent);
say(first==='Board for the 40 is short — Dave chasing it','my own comment was changed');
say((await p.$eval('[data-thread="watch"] .msg .msg-m',n=>n.textContent)).includes('edited'),
    'and it is marked as edited');

/* edit somebody else's */
await p.$$eval('[data-thread="watch"] [data-edit]',n=>n[1].click()); await p.waitForTimeout(250);
const t2=await p.$eval('.mdl-h',n=>n.textContent);
say(t2.includes('Dave M'),'editing another person names them in the title — "'+t2+'"');
await setTop(p,'textarea','Gluer down until noon');
await top(p,'[data-ok]'); await p.waitForTimeout(250);
say((await p.$$eval('[data-thread="watch"] .msg .msg-t',n=>n[1].textContent))==='Gluer down until noon',
    'their typo is fixed');
{const m=await p.$$eval('[data-thread="watch"] .msg .msg-m',n=>n[1].textContent);
 say(/^Dave · /.test(m)&&!/Angela/.test(m),
     'and it still stands in their name, not the editor\'s — "'+m+'"');
 say(!/\d{4}/.test(m),'with no year cluttering it');
 say((await p.$$('[data-thread="watch"] .msg-i')).length===0,
     'and nothing sits in front of the comment');}

/* delete: mine goes straight away, theirs asks */
await p.$$eval('[data-thread="watch"] [data-del]',n=>n[0].click()); await p.waitForTimeout(250);
say(await openN(p)===0 && (await p.$$('[data-thread="watch"] .msg')).length===1,
    'deleting my own is one click');
await p.$$eval('[data-thread="watch"] [data-del]',n=>n[0].click()); await p.waitForTimeout(250);
say(await openN(p)===1,'deleting somebody else’s asks first');
await top(p,'[data-ok]'); await p.waitForTimeout(250);
say((await p.$$('[data-thread="watch"] .msg')).length===0,'and then it goes');

/* once the morning is published it is for reading, not fiddling with */
await p.evaluate(()=>{COMMENTS={watch:[
  {ini:'AW',name:'Angela Wu',text:'Board short',when:'2026-08-19 7:41 AM'},
  {ini:'DM',name:'Dave M',text:'Gluer down',when:'2026-08-19 7:44 AM'}]};renderComments();});
const shown=()=>p.$$eval('.msg-acts',n=>n.filter(a=>a.offsetParent).length);
say(await shown()===2,'the buttons are there on a draft');
await p.evaluate(()=>document.body.classList.add('pres-mode')); await p.waitForTimeout(200);
say(await shown()===0,'and gone the moment it is published');
say((await p.$$('[data-thread="watch"] .msg')).length===2,'the comments themselves still read');
await p.evaluate(()=>document.body.classList.remove('pres-mode')); await p.waitForTimeout(200);
say(await shown()===2,'back again when it is a draft');
await p.context().close();

console.log('\n── the priorities card ──');
p=await fresh();
const anim=()=>p.$eval('#c-priorities',n=>getComputedStyle(n).animationName);
say(await p.$eval('#c-priorities',n=>n.classList.contains('awaiting')),
    'empty, so it is asking to be filled in');
say(await anim()==='prio-breathe','and it is breathing');
const red=await p.$eval('#c-priorities',n=>getComputedStyle(n).borderTopColor);
say(red!=='rgb(226, 231, 239)','and it is not the same colour as every other card — '+red);
await p.evaluate(()=>{localStorage.setItem(meKey,JSON.stringify({name:'A W',ini:'AW'}));
  COMMENTS={priorities:[{ini:'AW',name:'A W',text:'Get the 40 back up',when:'x'}]};renderComments();});
await p.waitForTimeout(200);
say(!(await p.$eval('#c-priorities',n=>n.classList.contains('awaiting'))),
    'somebody answers it and it settles');
say(await anim()==='none','no more movement');
say((await p.$$('.prio-empty')).length===0,'no extra wording inside the card');
/* empty again, but on the wall — a published morning must not flicker all day */
await p.evaluate(()=>{COMMENTS={};renderComments();document.body.classList.add('pres-mode');});
await p.waitForTimeout(200);
say(await anim()==='none','a published morning never flickers');
await p.evaluate(()=>document.body.classList.remove('pres-mode'));
await p.emulateMedia({reducedMotion:'reduce'}); await p.waitForTimeout(200);
say(await anim()==='none','and a PC set to reduce motion is left alone');
await p.context().close();

await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
