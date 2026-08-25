/* Read from across a room, and loaded up beyond what a normal morning brings. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const URL='file://'+process.cwd()+'/Morning_Dashboard.html';
const fresh=async(w=1600,h=1000)=>{const c=await b.newContext({viewport:{width:w,height:h}});
  const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1300); return {p,errs,c};};

/* WCAG contrast, worked out from what the browser actually paints. */
const CONTRAST = `(()=>{
  const lum=c=>{const [r,g,bl]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*r+0.7152*g+0.0722*bl;};
  const parse=s=>(s.match(/[\\d.]+/g)||[0,0,0]).slice(0,3).map(Number);
  const bgOf=el=>{let n=el;while(n&&n!==document.documentElement){
    const c=getComputedStyle(n).backgroundColor;
    if(c&&!/rgba\\(0, 0, 0, 0\\)|transparent/.test(c))return parse(c);n=n.parentElement;}
    return [255,255,255];};
  const ratio=el=>{const f=lum(parse(getComputedStyle(el).color)), g=lum(bgOf(el));
    return (Math.max(f,g)+0.05)/(Math.min(f,g)+0.05);};
  const out=[];
  document.querySelectorAll('.msg-t,.msg-m,.review-note,.finance-summary span,.finance-summary strong,.finance-delta,.c-lbl,.stat-tgt,.talk-h')
    .forEach(el=>{ if(!el.textContent.trim())return;
      const r=el.getBoundingClientRect(); if(!r.width)return;
      out.push({what:el.className.split(' ')[0], size:parseFloat(getComputedStyle(el).fontSize),
                ratio:Math.round(ratio(el)*100)/100, text:el.textContent.trim().slice(0,22)}); });
  return out;
})()`;

console.log('\n── can it be read from the back of the room ──');
let {p,errs,c}=await fresh();
await p.evaluate(()=>{
  localStorage.setItem(meKey,JSON.stringify({name:'Angela Wu',ini:'AW'}));
  COMMENTS={'rev-gluing':[{id:'g',ini:'DM',name:'Dave M',text:'Compression fault.',when:'2026-08-20 7:44 AM'}],
    staffing:[{id:'s',ini:'JJ',name:'Jehnae',text:'Two off in gluing.',when:'2026-08-20 8:13 AM'}],
    priorities:[{id:'p',ini:'AW',name:'Angela Wu',text:'Get the gluer back up.',when:'2026-08-20 7:52 AM'}]};
  renderComments();
  document.getElementById('i-fin-enabled').checked=true;
  document.getElementById('i-fin-actual').value=1740000;
  document.getElementById('i-fin-ytd-actual').value=22700000;
  applyAll(); document.body.classList.add('pres-mode');
});
await p.waitForTimeout(400);
const con=await p.evaluate(CONTRAST);
/* 4.5:1 is the ordinary readable floor; 3:1 is allowed once text is large */
const fails=con.filter(x=> x.size>=18 ? x.ratio<3 : x.ratio<4.5);
const worst=[...con].sort((a,b)=>a.ratio-b.ratio).slice(0,4);
say(fails.length===0,'every line meets the contrast it needs'
    +(fails.length?' — '+fails.map(f=>f.what+' '+f.ratio+':1 @'+f.size+'px "'+f.text+'"').join(' | '):''));
console.log('        thinnest four: '+worst.map(w=>w.what+' '+w.ratio+':1').join(', '));
await c.close();

console.log('\n── a morning with far too much on it ──');
({p,errs,c}=await fresh());
const long='A very long note that somebody pasted out of an email without thinking about it, '
  +'which runs on and on and mentions three machines, two customers and a delivery date, '
  +'and has no business being this length but will certainly happen one day.';
await p.evaluate(([long])=>{
  localStorage.setItem(meKey,JSON.stringify({name:'Angela Wu',ini:'AW'}));
  const many=(n,pre)=>Array.from({length:n},(_,i)=>({id:pre+i,ini:'JJ',name:'Jehnae',
    text:pre+' note '+(i+1), when:'2026-08-20 8:0'+(i%10)+' AM'}));
  COMMENTS={watch:many(20,'watch'), staffing:many(15,'staff'),
    'rev-gluing':[{id:'L',ini:'DM',name:'Dave M',text:long,when:'2026-08-20 7:44 AM'}],
    priorities:[{id:'p',ini:'AW',name:'Angela Wu',text:long,when:'2026-08-20 7:52 AM'}],
    preprod:[{id:'q',ini:'RS',name:'Rita S',text:'Ink room — '+long,when:'2026-08-20 8:02 AM'}]};
  renderComments(); applyAll(); document.body.classList.add('pres-mode');
},[long]);
await p.waitForTimeout(500);
const stress=await p.evaluate(()=>{
  const W=document.documentElement.clientWidth, over=[];
  document.querySelectorAll('.card,.talk').forEach(el=>{
    const r=el.getBoundingClientRect();
    if(r.width&&(r.right>W+1||r.left<-1))over.push(el.className);});
  const spill=[...document.querySelectorAll('.msg-t')].filter(el=>el.scrollWidth>el.clientWidth+1);
  return {wide:document.documentElement.scrollWidth>W+1, over, spill:spill.length,
          watch:document.querySelectorAll('[data-thread="watch"] .msg').length,
          bottom:[...document.querySelectorAll('#bottomGrid > .card')]
                   .filter(c=>getComputedStyle(c).display!=='none')
                   .map(c=>Math.round(c.getBoundingClientRect().height))};
});
say(!stress.wide,'twenty notes in one card and the page still does not scroll sideways');
say(stress.over.length===0,'nothing broke out of the grid'+(stress.over.length?': '+stress.over.join(', '):''));
say(stress.spill===0,'and a pasted paragraph wraps instead of running off — '+stress.spill+' spilling');
say(stress.watch===20,'all twenty are there — '+stress.watch);
say(Math.max(...stress.bottom)-Math.min(...stress.bottom)<=1,
    'and the row is still one height — '+stress.bottom.join(' / '));
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await c.close();

console.log('\n── six departments instead of three ──');
({p,errs,c}=await fresh());
const six=await p.evaluate(()=>{
  const extra=['printing','diecutting','gluing','windowing','printing','diecutting'];
  deptConfig=extra.map((id,i)=>normalizeDeptConfig({optionId:id,key:id+i}));
  reviewConfig=extra.map((id,i)=>normalizeReviewConfig({optionId:id,key:id+i}));
  renderProductionSection(false); renderReviewSection(false); renderComments(); applyAll();
  const W=document.documentElement.clientWidth, over=[];
  document.querySelectorAll('#prod-grid .card,#review-grid .card').forEach(el=>{
    const r=el.getBoundingClientRect(); if(r.width&&r.right>W+1)over.push(el.className);});
  return {wide:document.documentElement.scrollWidth>W+1, over,
          prod:document.querySelectorAll('#prod-grid .card').length,
          rev:document.querySelectorAll('#review-grid .card').length};
});
say(six.prod===7,'six departments and last week — '+six.prod+' cards');
say(six.rev===6,'and six on the review row — '+six.rev);
say(!six.wide&&six.over.length===0,'with nothing off the edge'
    +(six.over.length?': '+six.over.join(', '):''));
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await c.close();

await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
