import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const p=await b.newPage({viewport:{width:1400,height:820},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/'+(process.argv[2]||'Morning_Dashboard.html'));
await p.waitForTimeout(1200);
await p.click('#editBtn'); await p.waitForTimeout(500);
const card=await p.$eval('.maintenance-card',n=>({scroll:n.scrollWidth,client:n.clientWidth,
  canScroll:getComputedStyle(n).overflowX==='auto'}));
say(card.canScroll,'the maintenance card scrolls sideways while it is being edited');
/* scroll it right and the row buttons must then be in view */
await p.$eval('.maintenance-card',n=>n.scrollLeft=n.scrollWidth);
await p.waitForTimeout(200);
const reach=await p.evaluate(()=>{
  const c=document.querySelector('.maintenance-card').getBoundingClientRect();
  return [...document.querySelectorAll('#maintTbl .maint-row-btn')]
    .every(b=>{const r=b.getBoundingClientRect();return r.right<=c.right+1&&r.left>=c.left-1;});});
say(reach,'and every row button is reachable');
await p.$eval('.maintenance-card',n=>n.scrollLeft=0); await p.waitForTimeout(150);
const w=await p.$$eval('#maintTbl tbody tr:first-child .ei',n=>n.map(x=>Math.round(x.getBoundingClientRect().width)));
say(w.every(x=>x>=34),'the boxes are wide enough to read — '+JSON.stringify(w));
const rows=await p.$$eval('#maintTbl .maint-actions',n=>n.map(a=>
  new Set([...a.children].map(c=>Math.round(c.getBoundingClientRect().top))).size));
say(rows.every(r=>r===1),'and the buttons stay on one line');
await (await p.$('.maintenance-card')).screenshot({path:'shot_maint.png'});
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nok\n'); process.exit(bad?1:0);
