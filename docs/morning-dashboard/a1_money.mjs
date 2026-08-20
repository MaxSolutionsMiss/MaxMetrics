/* The money card at the edges of the year, where arithmetic usually breaks. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const c=await b.newContext({viewport:{width:1600,height:1000}});
const p=await c.newPage(); const errs=[];
p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto('file://'+process.cwd()+'/Mississauga_Morning_Dashboard.html');
await p.waitForTimeout(1400);

/* Set the day, the sales so far, and read back everything the card says. */
const on = (date, mtd, ytd) => p.evaluate(([date,mtd,ytd])=>{
  document.getElementById('dashDate').value=date;
  document.getElementById('i-fin-enabled').checked=true;
  document.getElementById('i-fin-actual').value=mtd;
  document.getElementById('i-fin-ytd-actual').value=ytd;
  applyFinancials();
  const t=id=>document.getElementById(id).textContent.trim();
  return {when:t('d-fin-report-date'), sold:t('d-fin-actual'), verdict:t('d-fin-var'),
          budget:t('d-fin-budget'), expected:t('d-fin-plan'),
          togo:t('d-fin-togo'), left:t('d-fin-left'),
          ysold:t('d-fin-ytd-actual'), yverdict:t('d-fin-ytd-var'),
          ybudget:t('d-fin-year-budget'), yexpected:t('d-fin-ytd-plan'),
          ytogo:t('d-fin-ytd-togo'), yleft:t('d-fin-ytd-left')};
},[date,mtd,ytd]);
const num = s => Number(String(s).replace(/[^0-9.]/g,''));

console.log('\n── the first of January ──');
/* the morning of 1 Jan reports the last day of December, in the year just gone */
let r = await on('2026-01-01', 500000, 33000000);
say(/Dec 31/.test(r.when), 'reports through 31 December — "'+r.when+'"');
say(r.left==='0', 'no selling days left in a month that is over — '+r.left);
say(r.yleft==='0', 'and no months left in the year — '+r.yleft);
say(!/NaN|Infinity|undefined/.test(JSON.stringify(r)), 'nothing came out as NaN');

console.log('\n── the second of January: a year with nothing sold yet ──');
r = await on('2026-01-02', 0, 0);
say(/Jan 1/.test(r.when), 'reports through 1 January — "'+r.when+'"');
say(num(r.togo)===num(r.budget), 'the whole month is still to sell — '+r.togo+' of '+r.budget);
say(num(r.ytogo)===num(r.ybudget), 'and the whole year — '+r.ytogo+' of '+r.ybudget);
say(r.yleft==='11', 'with eleven months to do it in — '+r.yleft);
say(/behind plan|ahead of plan/.test(r.verdict), 'and it still reaches a verdict — "'+r.verdict+'"');

console.log('\n── the last day of a month ──');
r = await on('2026-04-01', 9000000, 12000000);
say(/Mar 31/.test(r.when), 'the 1st reports the last day of the month before — "'+r.when+'"');
say(r.left==='0', 'nothing left to sell it in — '+r.left);
say(r.togo==='Budget met', 'and a month that made its budget says so — "'+r.togo+'"');

console.log('\n── sold more than the budget ──');
r = await on('2026-08-20', 4000000, 40000000);
say(r.togo==='Budget met' && r.ytogo==='Budget met',
    'neither reads as a negative amount still to sell — "'+r.togo+'" / "'+r.ytogo+'"');
say(/ahead of plan/.test(r.verdict), 'and the verdict agrees — "'+r.verdict+'"');

console.log('\n── nothing typed in yet, which is every morning until somebody does ──');
r = await p.evaluate(()=>{
  document.getElementById('i-fin-actual').value='';
  document.getElementById('i-fin-ytd-actual').value='';
  applyFinancials();
  const t=id=>document.getElementById(id).textContent.trim();
  const card=document.getElementById('financeCard');
  return {sold:t('d-fin-actual'),togo:t('d-fin-togo'),verdict:t('d-fin-var'),
          cls:card.className};
});
say(!/NaN|Infinity/.test(JSON.stringify(r)),'an empty box is not NaN');
say(r.sold==='—','an untyped figure reads as a dash, not as nought — "'+r.sold+'"');
say(!/behind plan/.test(r.verdict),'and claims no verdict — "'+r.verdict.trim()+'"');
say(!/\b(red|amber|green)\b/.test(r.cls),
    'the card does not go red over a box nobody has filled in — "'+r.cls.trim()+'"');
say(r.togo==='—','nor say what is still to sell — "'+r.togo+'"');

console.log('\n── one of the two typed in ──');
r = await p.evaluate(()=>{
  document.getElementById('i-fin-actual').value=1740000;
  document.getElementById('i-fin-ytd-actual').value='';
  applyFinancials();
  const t=id=>document.getElementById(id).textContent.trim();
  return {sold:t('d-fin-actual'),ysold:t('d-fin-ytd-actual'),
          verdict:t('d-fin-var'),yverdict:t('d-fin-ytd-var'),
          cls:document.getElementById('financeCard').className};
});
say(r.sold!=='—'&&r.ysold==='—','the month reads and the year waits — '+r.sold+' / '+r.ysold);
say(/behind plan|ahead of plan/.test(r.verdict)&&!/plan/.test(r.yverdict),
    'and only the one with a figure is judged');
say(/\b(red|amber|green)\b/.test(r.cls),'the card takes its colour from the half it can judge');

console.log('\n── switched off ──');
r = await p.evaluate(()=>{
  document.getElementById('i-fin-enabled').checked=false; applyFinancials();
  const card=document.getElementById('financeCard');
  return {hidden:card.classList.contains('hidden'),
          grid:document.getElementById('bottomGrid').classList.contains('no-fin')};
});
say(r.hidden&&r.grid,'the card goes and the row closes up behind it');

say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
