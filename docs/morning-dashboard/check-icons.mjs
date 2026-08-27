import { chromium } from 'playwright';
const F='file:///home/user/MaxMetrics/docs/morning-dashboard/Morning_Dashboard.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await (await b.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1.5})).newPage();
let fails=0; const ok=(t,c,x='')=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+t+(x?'   '+x:''));};
p.on('pageerror',e=>{fails++;console.log('  !! '+e.message);});
await p.goto(F); await p.waitForTimeout(1400);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));

console.log('\n1 — Pack Size exists and has a drawn icon');
ok('Pack Size is an option', await p.evaluate(()=>!!DEPT_OPTIONS.find(o=>o.id==='packsize')));
ok('its icon is a drawing, not an emoji',
   await p.evaluate(()=>DEPT_OPTIONS.find(o=>o.id==='packsize').icon==='svg:case'));
ok('the drawing renders as svg', await p.evaluate(()=>iconHTML('svg:case').startsWith('<svg')));
ok('an emoji passes through', await p.evaluate(()=>iconHTML('🚚')==='🚚'));
ok('nothing falls back to a clipboard', await p.evaluate(()=>iconHTML('')==='📋'));

console.log('\n2 — the Configure panel offers an icon button per card');
await p.click('#editBtn'); await p.waitForTimeout(400);
await p.evaluate(()=>openDeptConfig()); await p.waitForTimeout(400);
const nBtns = await p.evaluate(()=>document.querySelectorAll('#deptSlots [onclick^="pickDeptIcon"]').length);
ok('one icon button per department', nBtns===await p.evaluate(()=>tempConfig.length), nBtns+' buttons');

console.log('\n3 — changing an icon through the picker');
await p.evaluate(()=>pickDeptIcon(0)); await p.waitForTimeout(400);
ok('the picker opened', await p.locator('.mdl-bg').count()>0);
const choices = await p.evaluate(()=>document.querySelectorAll('#ic-grid [data-ic]').length);
ok('it offers a grid', choices>20, choices+' icons');
await p.evaluate(()=>document.querySelector('[data-ic="svg:case"]').click());
await p.waitForTimeout(200);
await p.evaluate(()=>document.querySelector('.mdl-bg [data-ok]').click());
await p.waitForTimeout(400);
ok('slot 0 took the case icon', await p.evaluate(()=>tempConfig[0].icon==='svg:case'),
   await p.evaluate(()=>tempConfig[0].icon));

console.log('\n4 — a typed emoji wins over the grid');
await p.evaluate(()=>pickDeptIcon(1)); await p.waitForTimeout(350);
await p.evaluate(()=>{document.querySelector('#ic-own').value='🏭';});
await p.evaluate(()=>document.querySelector('.mdl-bg [data-ok]').click());
await p.waitForTimeout(350);
ok('slot 1 took the typed emoji', await p.evaluate(()=>tempConfig[1].icon==='🏭'),
   await p.evaluate(()=>tempConfig[1].icon));

console.log('\n5 — save, and the card on the page shows it');
await p.evaluate(()=>{ tempConfig[0].optionId='packsize'; });
await p.evaluate(()=>saveDeptConfig()); await p.waitForTimeout(700);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
const head0 = await p.evaluate(()=>document.querySelector('#c-dept-0 .c-icon').innerHTML);
ok('the first card draws the case', head0.includes('<svg'), head0.slice(0,40));
ok('and is named Pack Size',
   (await p.evaluate(()=>document.querySelector('#c-dept-0 .c-lbl').textContent))==='Pack Size');
const head1 = await p.evaluate(()=>document.querySelector('#c-dept-1 .c-icon').textContent.trim());
ok('the second card shows the typed emoji', head1==='🏭', head1);

console.log('\n6 — the review card follows the production card');
const rev = await p.evaluate(()=>{
  const i=reviewConfig.findIndex(c=>c.optionId==='packsize');
  return i<0?null:document.querySelector(`#c-rev-${i} .c-icon`).innerHTML;
});
ok('a review card for the same department inherits it', rev===null||rev.includes('<svg'),
   rev===null?'no packsize review card yet':rev.slice(0,30));

console.log('\n7 — a review card can be given its own icon');
await p.evaluate(()=>openReviewConfig()); await p.waitForTimeout(400);
const rBtns = await p.evaluate(()=>document.querySelectorAll('#reviewSlots [onclick^="pickReviewIcon"]').length);
ok('one icon button per review card', rBtns>0, rBtns+' buttons');
const last = await p.evaluate(()=>tempReviewConfig.length-1);
await p.evaluate(i=>pickReviewIcon(i), last); await p.waitForTimeout(350);
await p.evaluate(()=>document.querySelector('[data-ic="svg:pallet"]').click());
await p.evaluate(()=>document.querySelector('.mdl-bg [data-ok]').click());
await p.waitForTimeout(350);
await p.evaluate(()=>saveReviewConfig()); await p.waitForTimeout(600);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
const shown = await p.evaluate(i=>document.querySelector(`#c-rev-${i} .c-icon`).innerHTML, last);
ok('the shipping card took the pallet', shown.includes('<svg'), shown.slice(0,30));

console.log('\n8 — it survives a reload');
await p.reload(); await p.waitForTimeout(1500);
await p.evaluate(()=>document.querySelectorAll('.mdl-bg').forEach(m=>m.remove()));
ok('the case icon is still on card 0',
   (await p.evaluate(()=>document.querySelector('#c-dept-0 .c-icon').innerHTML)).includes('<svg'));
ok('the typed emoji is still on card 1',
   (await p.evaluate(()=>document.querySelector('#c-dept-1 .c-icon').textContent.trim()))==='🏭');

await p.evaluate(()=>{document.getElementById('review-grid').scrollIntoView();});
await p.waitForTimeout(300);
await p.screenshot({path:'icons.png',fullPage:false});
console.log(fails?`\n${fails} failed\n`:'\nall good\n');
await b.close();
process.exit(fails?1:0);
