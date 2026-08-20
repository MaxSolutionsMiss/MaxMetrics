/* A busy Thursday: four staffing notes, four on the watch list, money on show. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const c=await b.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:2});
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/Mississauga_Morning_Dashboard.html');
await p.waitForTimeout(1400);
await p.evaluate(()=>{
  localStorage.setItem(meKey,JSON.stringify({name:'Jehnae J',ini:'JJ'}));
  const t=(x,w)=>({id:'i'+x.length+w,ini:'JJ',name:'Jehnae',text:x,when:w});
  COMMENTS={staffing:[
    {id:'s0',ini:'JR',name:'Javad Resa',text:'Jamaal is off until further notice.',when:'2026-08-20 7:58 AM'},
    t('Oliver is off on Friday August 21st and Monday August 24th','2026-08-20 8:13 AM'),
    t('Ann will be off for the week beginning August 24th','2026-08-20 8:14 AM'),
    t('Angie will be off on August 24th, August 27th, and August 28th','2026-08-20 8:16 AM')],
   watch:[t('2018 - Midnight shift 12hr','2026-08-20 8:11 AM'),
     t('40in - Friday PM shift','2026-08-20 8:12 AM'),
     t('40in - Saturday AM shift','2026-08-20 8:12 AM'),
     t('2017/2018 - 2 weekend shifts','2026-08-20 8:12 AM')],
   priorities:[{id:'p1',ini:'AW',name:'Angela Wu',
     text:'Get the gluer back up and clear the short board before second shift.',when:'2026-08-20 7:52 AM'}]};
  renderComments();
  document.getElementById('i-fin-enabled').checked=true;
  document.getElementById('i-fin-actual').value=1740000;
  document.getElementById('i-fin-ytd-actual').value=22700000;
  applyAll(); document.body.classList.add('pres-mode');
});
await p.waitForTimeout(500);

console.log('\n── what matters most ──');
const size=await p.evaluate(()=>{
  const px=el=>parseFloat(getComputedStyle(el).fontSize);
  const wt=el=>getComputedStyle(el).fontWeight;
  const prio=document.querySelector('#c-priorities .msg-t');
  const other=document.querySelector('#bottomGrid .msg-t');
  return {prio:px(prio), other:px(other), prioW:+wt(prio), otherW:+wt(other),
          lbl:px(document.querySelector('#c-priorities .c-lbl')),
          lblOther:px(document.querySelector('#watchCard .c-lbl'))};
});
const ratio=size.prio/size.other;
say(ratio>=1.18,'the sentence is a fifth larger than the same text elsewhere — '
  +size.other+'px against '+size.prio+'px, '+Math.round((ratio-1)*100)+'% up');
say(size.prioW>size.otherW,'and carries more weight — '+size.otherW+' against '+size.prioW);
say(size.lbl>size.lblOther,'the heading grew with it — '+size.lblOther+'px against '+size.lbl+'px');

console.log('\n── the bottom row on a busy morning ──');
const g=await p.evaluate(()=>{
  const cards=[...document.querySelectorAll('#bottomGrid > .card')]
    .filter(c=>getComputedStyle(c).display!=='none');
  const h=cards.map(c=>Math.round(c.getBoundingClientRect().height));
  const fin=cards.find(c=>c.id==='financeCard');
  const dual=fin.querySelector('.finance-panel').getBoundingClientRect();
  const fr=fin.getBoundingClientRect();
  const head=fin.querySelector('.c-head').getBoundingClientRect();
  return {names:cards.map(c=>c.querySelector('.c-lbl').textContent.trim()), heights:h,
          spread:Math.max(...h)-Math.min(...h),
          above:Math.round(dual.top-head.bottom), below:Math.round(fr.bottom-dual.bottom)};
});
say(g.spread<=1,'all four cards stand at one height — '+g.heights.join(' / '));
say(Math.abs(g.above-g.below)<=24,
  'and the money sits in the middle of its card rather than stranded at the top — '
  +g.above+'px above, '+g.below+'px below');

/* the same row, quiet, must not have gone strange */
await p.evaluate(()=>{ COMMENTS={staffing:[{id:'q',ini:'AW',name:'Angela Wu',
  text:'Full crew.',when:'2026-08-20 7:40 AM'}]}; renderComments(); });
await p.waitForTimeout(300);
const q=await p.evaluate(()=>{
  const cards=[...document.querySelectorAll('#bottomGrid > .card')]
    .filter(c=>getComputedStyle(c).display!=='none');
  const h=cards.map(c=>Math.round(c.getBoundingClientRect().height));
  return {heights:h, spread:Math.max(...h)-Math.min(...h)};
});
say(q.spread<=1,'and on a quiet morning too — '+q.heights.join(' / '));
say(q.heights[0]<g.heights[0],'with the row shorter than it was when it was busy');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
