import { chromium } from 'playwright';
const F='file:///home/user/MaxMetrics/docs/morning-dashboard/Morning_Dashboard.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await (await b.newContext({viewport:{width:1600,height:1050},deviceScaleFactor:2})).newPage();
let fails=0; const ok=(t,c,x='')=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+t+(x?'   '+x:''));};
p.on('pageerror',e=>{fails++;console.log('  !! '+e.message);});
await p.goto(F); await p.waitForTimeout(1400);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));

console.log('\n1 — outside edit mode the icon is just an icon');
await p.evaluate(()=>document.querySelector('#c-rev-0 .c-icon').click());
await p.waitForTimeout(300);
ok('clicking it does nothing', await p.locator('.mdl-bg').count()===0);
ok('and it shows no ring', await p.evaluate(()=>
  getComputedStyle(document.querySelector('#c-rev-0 .c-icon')).outlineStyle!=='dashed'));

console.log('\n2 — in edit mode it invites the click');
await p.click('#editBtn'); await p.waitForTimeout(600);
ok('the ring is there', await p.evaluate(()=>
  getComputedStyle(document.querySelector('#c-rev-0 .c-icon')).outlineStyle==='dashed'));
ok('and the cursor says button', await p.evaluate(()=>
  getComputedStyle(document.querySelector('#c-rev-0 .c-icon')).cursor==='pointer'));

console.log('\n3 — changing the shipping card by clicking its truck');
const shipIdx = await p.evaluate(()=>reviewConfig.findIndex(c=>c.optionId==='shipping'));
ok('there is a shipping review card', shipIdx>=0, 'index '+shipIdx);
await p.evaluate(i=>document.querySelector(`#c-rev-${i} .c-icon`).click(), shipIdx);
await p.waitForTimeout(500);
ok('the picker opened from the card', await p.locator('.mdl-bg').count()>0);
ok('and it is on top of everything', await p.evaluate(()=>
  Number(getComputedStyle(document.querySelector('.mdl-bg')).zIndex)>=2000));
await p.evaluate(()=>document.querySelector('[data-ic="svg:case"]').click());
await p.evaluate(()=>document.querySelector('.mdl-bg [data-ok]').click());
await p.waitForTimeout(600);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
const drawn = await p.evaluate(i=>document.querySelector(`#c-rev-${i} .c-icon`).innerHTML, shipIdx);
ok('the truck became a corrugated case', drawn.includes('<svg'), drawn.slice(0,28));
ok('the card is still called Shipping',
   (await p.evaluate(i=>document.querySelector(`#c-rev-${i} .c-lbl`).textContent, shipIdx))==='Shipping');

console.log('\n4 — typed numbers are not thrown away by the re-render');
await p.evaluate(()=>{
  const e=document.getElementById('i-dept-0-qty'); e.value='4321';
  e.dispatchEvent(new Event('input',{bubbles:true}));
});
await p.evaluate(()=>document.querySelector('#c-dept-0 .c-icon').click());
await p.waitForTimeout(450);
await p.evaluate(()=>document.querySelector('[data-ic="🏭"]').click());
await p.evaluate(()=>document.querySelector('.mdl-bg [data-ok]').click());
await p.waitForTimeout(600);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
ok('what was typed is still there',
   (await p.evaluate(()=>document.getElementById('i-dept-0-qty').value))==='4321',
   await p.evaluate(()=>document.getElementById('i-dept-0-qty').value));
ok('the production icon changed',
   (await p.evaluate(()=>document.querySelector('#c-dept-0 .c-icon').textContent.trim()))==='🏭');

console.log('\n5 — it survives a reload');
await p.reload(); await p.waitForTimeout(1500);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
ok('shipping kept the case', (await p.evaluate(i=>
  document.querySelector(`#c-rev-${i} .c-icon`).innerHTML, shipIdx)).includes('<svg'));
ok('printing kept the factory', (await p.evaluate(()=>
  document.querySelector('#c-dept-0 .c-icon').textContent.trim()))==='🏭');

console.log('\n6 — on the wall there is no ring');
await p.evaluate(()=>{document.body.classList.add('pres-mode');});
await p.waitForTimeout(200);
ok('presentation mode shows a clean icon', await p.evaluate(()=>
  getComputedStyle(document.querySelector('#c-rev-0 .c-icon')).outlineStyle!=='dashed'));

await p.evaluate(()=>{document.body.classList.remove('pres-mode');});
await p.click('#editBtn'); await p.waitForTimeout(500);
await p.evaluate(()=>document.getElementById('review-grid').scrollIntoView({block:'center'}));
await p.waitForTimeout(300);
await p.locator('#review-grid').screenshot({path:'shot-cardicon.png'});
console.log(fails?`\n${fails} failed\n`:'\nall good\n');
await b.close();
process.exit(fails?1:0);
