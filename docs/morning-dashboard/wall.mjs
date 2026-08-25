/* The twentieth, as it would actually be: one fault in gluing, three quiet
   departments, a couple of threads nobody wrote in. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const c=await b.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:2});
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/Morning_Dashboard.html');
await p.waitForTimeout(1400);

await p.evaluate(()=>{
  localStorage.setItem(meKey,JSON.stringify({name:'Angela Wu',ini:'AW'}));
  COMMENTS={
    'rev-gluing':[{id:'x1',ini:'DM',name:'Dave M',
      text:'Compression fault causing downtime — Vega picking up the Kellogg run.',
      when:'2026-08-20 7:44 AM'}],
    priorities:[{id:'x2',ini:'AW',name:'Angela Wu',
      text:'Get the gluer back up and clear the short board before second shift.',
      when:'2026-08-20 7:52 AM'}],
  };
  renderComments();
  /* three departments quiet, gluing in trouble */
  reviewConfig.forEach((cfg,i)=>{
    const sel=document.getElementById('s-rev-'+i);
    const isGl=/glu/i.test(cfg.optionId||'');
    if(sel){sel.value=isGl?'r':'g';}
    const ta=document.getElementById('i-rev-'+i); if(ta)ta.value='';
  });
  applyAll();
});
await p.waitForTimeout(400);

console.log('\n── filling it in ──');
say((await p.$$eval('.say',n=>n.filter(x=>x.offsetParent).length))>0,'the Add rows are there while it is a draft');
const emptyDraft=await p.$$eval('.talk.thread-empty',n=>n.filter(x=>x.offsetParent).length);
say(emptyDraft>0,'and so are the threads nobody has written in yet — '+emptyDraft);
await p.screenshot({path:'wall_draft.png',fullPage:false});

console.log('\n── on the wall ──');
await p.click('#draftBtn'); await p.waitForTimeout(800);
/* the folder is not set up here, so dismiss whatever it asks */
const dlg=await p.$$('.mdl-bg');
if(dlg.length) await p.evaluate(()=>{document.querySelectorAll('.mdl-bg').forEach(m=>m.remove());
  document.body.classList.add('pres-mode');});
await p.waitForTimeout(400);

say(await p.$eval('body',n=>n.classList.contains('pres-mode')),'it is in present mode');
say((await p.$$eval('.say',n=>n.filter(x=>x.offsetParent).length))===0,
    'every Add box and button is gone');
say((await p.$$eval('.who-pick',n=>n.filter(x=>x.offsetParent).length))===0,'and the name picker with it');
say((await p.$$eval('.talk.thread-empty:not(.keep-empty)',n=>n.filter(x=>x.offsetParent).length))===0,
    'no section comments box left standing over an empty thread');
say((await p.$$eval('.msg-acts',n=>n.filter(x=>x.offsetParent).length))===0,'no Edit or Delete');

const notes=await p.$$eval('.review-note',n=>n.map(x=>x.textContent.trim()));
say(!notes.some(t=>/No issues reported/.test(t)),
    'nothing says "No issues reported" — '+JSON.stringify(notes));

/* the one department with something to say puts it at the top of its card */
const gl=await p.evaluate(()=>{
  const box=document.querySelector('[data-thread="rev-gluing"]');
  if(!box)return null;
  const card=box.closest('.review-card');
  const head=card.querySelector('.c-head').getBoundingClientRect();
  const msg=box.querySelector('.msg').getBoundingClientRect();
  const cr=card.getBoundingClientRect();
  return {gapFromHead:Math.round(msg.top-head.bottom),
          slackBelow:Math.round(cr.bottom-msg.bottom),
          text:box.querySelector('.msg-t').textContent.trim()};
});
say(gl!==null,'the gluing card carries the fault — "'+(gl&&gl.text)+'"');
say(gl.gapFromHead<70,'and it sits just under the heading, not at the bottom — '
    +gl.gapFromHead+'px below it');
say(gl.slackBelow>=0,'with the empty space underneath it instead of above ('
    +gl.slackBelow+'px)');

/* nothing sits in front of a comment competing with it */
say((await p.$$('.msg-i')).length===0,'no initials tile in front of any comment');
const byline=await p.$eval('[data-thread="rev-gluing"] .msg-m',n=>n.textContent.trim());
say(/^Dave · \d+ \w{3} /.test(byline),'the byline is a first name and a short date — "'+byline+'"');
say(!/\d{4}/.test(byline),'with no year in it');

/* nothing leaves the wall for being quiet — a row with a hole in it reads as a fault */
const watch=await p.$eval('#watchCard',n=>getComputedStyle(n).display);
say(watch!=='none','an empty Watch List card stays on the wall');
const noteH=await p.$$eval('#bottomGrid .notes-card',n=>n.map(x=>Math.round(x.getBoundingClientRect().height)));
say(noteH.length===2 && Math.abs(noteH[0]-noteH[1])<=1,
    'and stands the same height as the one beside it — '+noteH.join(' / '));

/* one department had a bad night; the row keeps its shape around it */
const row=await p.evaluate(()=>{
  const cards=[...document.querySelectorAll('#review-grid .card')];
  const gl=cards.find(c=>c.querySelector('[data-thread="rev-gluing"]'));
  const h=cards.map(c=>Math.round(c.getBoundingClientRect().height));
  return {shown:cards.every(c=>getComputedStyle(c).display!=='none'),
          heights:h, spread:Math.max(...h)-Math.min(...h),
          dots:cards.filter(c=>{const d=c.querySelector('.sdot');
                 return d && getComputedStyle(d).display!=='none';}).length,
          glHasText:!!gl.querySelector('.msg')};
});
say(row.shown,'every production card is still there, quiet or not');
say(row.spread<=1,'and all four stand at one height — '+row.heights.join(' / '));
say(row.glHasText,'with the fault written in the one that had it');
say(row.dots===0,'no status bullets left on the wall');

/* pre-production is three cards, and stays three cards */
const pp=await p.evaluate(()=>{
  const box=document.getElementById('preprodCard');
  const sec=[...document.querySelectorAll('.sec')].find(s=>/pre-produc/i.test(s.textContent));
  return {shown:box && getComputedStyle(box).display!=='none',
          empty:box.classList.contains('thread-empty'),
          heading:box.querySelector('.talk-h').textContent.replace(/\s+/g,' ').trim()};
});
say(pp.shown,'the pre-production support card is on the wall');
say(pp.empty,'even with nobody having written in it yet');
say(/Ink room/.test(pp.heading),'and the ink room is named on it — "'+pp.heading+'"');

say((await p.$$('[data-thread="priorities"] .msg')).length===1,'what matters most still reads');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await p.screenshot({path:'wall_present.png',fullPage:false});

/* a morning where nothing went wrong: all four collapse together */
await p.evaluate(()=>{ COMMENTS={}; renderComments();
  reviewConfig.forEach((_,i)=>{const sel=document.getElementById('s-rev-'+i);
    if(sel)sel.value='g'; const ta=document.getElementById('i-rev-'+i); if(ta)ta.value='';});
  applyAll(); });
await p.waitForTimeout(400);
const calm=await p.evaluate(()=>{
  const h=[...document.querySelectorAll('#review-grid .card')]
            .map(c=>Math.round(c.getBoundingClientRect().height));
  return {heights:h, spread:Math.max(...h)-Math.min(...h)};
});
say(calm.spread<=1,'a quiet morning has all four at one height too — '+calm.heights.join(' / '));
say(calm.heights[0]<140,'and they collapse rather than holding empty space — '+calm.heights[0]+'px');

/* and back again — nothing is lost by presenting */
await p.evaluate(()=>document.body.classList.remove('pres-mode'));
await p.waitForTimeout(300);
say((await p.$$eval('.say',n=>n.filter(x=>x.offsetParent).length))>0,
    'the boxes come back when it is a draft again');
say((await p.$$eval('.talk.thread-empty',n=>n.filter(x=>x.offsetParent).length))>0,
    'and so do the empty threads, ready to be written in');

await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
