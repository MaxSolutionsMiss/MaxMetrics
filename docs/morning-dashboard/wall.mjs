/* The twentieth, as it would actually be: one fault in gluing, three quiet
   departments, a couple of threads nobody wrote in. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const c=await b.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:2});
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/Mississauga_Morning_Dashboard.html');
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
await p.click('#pubBtn'); await p.waitForTimeout(800);
/* the folder is not set up here, so dismiss whatever it asks */
const dlg=await p.$$('.mdl-bg');
if(dlg.length) await p.evaluate(()=>{document.querySelectorAll('.mdl-bg').forEach(m=>m.remove());
  document.body.classList.add('pres-mode');});
await p.waitForTimeout(400);

say(await p.$eval('body',n=>n.classList.contains('pres-mode')),'it is in present mode');
say((await p.$$eval('.say',n=>n.filter(x=>x.offsetParent).length))===0,
    'every Add box and button is gone');
say((await p.$$eval('.who-pick',n=>n.filter(x=>x.offsetParent).length))===0,'and the name picker with it');
say((await p.$$eval('.talk.thread-empty',n=>n.filter(x=>x.offsetParent).length))===0,
    'no headings left standing over empty threads');
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

const ini=await p.$eval('.msg-i',n=>{const r=n.getBoundingClientRect();return Math.round(r.width);});
say(ini<=24,'the initials are small enough to sit beside the words — '+ini+'px');

/* a Watch List with nothing on it is a titled white box saying nothing */
const watch=await p.$eval('#watchCard',n=>getComputedStyle(n).display);
say(watch==='none','an empty Watch List card leaves the wall altogether');
/* but a quiet department keeps its card — there the dot is the answer */
const quiet=await p.evaluate(()=>{
  const cards=[...document.querySelectorAll('#review-grid .card')];
  const gl=cards.find(c=>c.querySelector('[data-thread="rev-gluing"]'));
  const others=cards.filter(c=>c!==gl);
  return {allShown:cards.every(c=>getComputedStyle(c).display!=='none'),
          dots:others.filter(c=>c.querySelector('.sdot')).length,
          shorter:others.every(c=>c.getBoundingClientRect().height
                                  < gl.getBoundingClientRect().height-20)};
});
say(quiet.allShown,'every production card is still on the wall');
say(quiet.dots===3,'the quiet ones keep their status dot — no news is good news');
say(quiet.shorter,'and shrink to their heading instead of matching the bad one');

say((await p.$$('[data-thread="priorities"] .msg')).length===1,'what matters most still reads');
say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await p.screenshot({path:'wall_present.png',fullPage:false});

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
