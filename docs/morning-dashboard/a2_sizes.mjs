/* The same morning on a boardroom TV, a laptop and a half-width window.
   Nothing may run off the side, overlap a neighbour, or get cut off. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};

const SEED = ()=>{
  localStorage.setItem(meKey,JSON.stringify({name:'Angela Wu',ini:'AW'}));
  COMMENTS={
    'rev-gluing':[{id:'g',ini:'DM',name:'Dave M',
      text:'Compression fault causing downtime — Vega picking up the Kellogg run.',
      when:'2026-08-20 7:44 AM'}],
    staffing:[{id:'s1',ini:'JR',name:'Javad Resa',text:'Jamaal is off until further notice.',when:'2026-08-20 7:58 AM'},
      {id:'s2',ini:'JJ',name:'Jehnae',text:'Angie will be off on August 24th, August 27th, and August 28th',when:'2026-08-20 8:16 AM'}],
    watch:[{id:'w1',ini:'JJ',name:'Jehnae',text:'2017/2018 - 2 weekend shifts',when:'2026-08-20 8:12 AM'}],
    preprod:[{id:'x',ini:'RS',name:'Rita S',text:'Ink room — Pantone 032 short until Thursday.',when:'2026-08-20 8:02 AM'}],
    priorities:[{id:'p',ini:'AW',name:'Angela Wu',
      text:'Get the gluer back up and clear the short board before second shift.',when:'2026-08-20 7:52 AM'}]};
  renderComments();
  document.getElementById('i-fin-enabled').checked=true;
  document.getElementById('i-fin-actual').value=1740000;
  document.getElementById('i-fin-ytd-actual').value=22700000;
  ['i-injDate','i-nmDate'].forEach(k=>{const e=document.getElementById(k);if(e)e.value='2026-07-08';});
  const short=document.getElementById('i-short'); if(short)short.value=2;
  reviewConfig.forEach((cfg,i)=>{const sel=document.getElementById('s-rev-'+i);
    if(sel)sel.value=/glu/i.test(cfg.optionId||'')?'r':'g';});
  applyAll();
};

/* Every visible box, measured against the page and against each other. */
const SURVEY = ()=>{
  const docW=document.documentElement.clientWidth;
  const over=[];                      /* anything sticking out sideways */
  const clipped=[];                   /* text taller or wider than its box */
  document.querySelectorAll('.card,.talk,.ship-strip,.sec,.hdr,table').forEach(el=>{
    const r=el.getBoundingClientRect();
    if(r.width===0&&r.height===0)return;
    if(r.right>docW+1||r.left<-1) over.push((el.className||el.tagName)+' '+Math.round(r.left)+'..'+Math.round(r.right));
  });
  document.querySelectorAll('.c-lbl,.stat-val,.finance-main,.msg-t,.review-note,.finance-summary strong')
    .forEach(el=>{
      if(getComputedStyle(el).overflow==='visible')return;
      if(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)
        clipped.push(el.className+': "'+el.textContent.trim().slice(0,28)+'"');
    });
  /* cards in the same row must not sit on top of one another */
  const overlaps=[];
  const rows={};
  document.querySelectorAll('#bottomGrid > .card, #review-grid .card').forEach(el=>{
    if(getComputedStyle(el).display==='none')return;
    const r=el.getBoundingClientRect();
    const key=Math.round(r.top/10);
    (rows[key]=rows[key]||[]).push({el,r});
  });
  Object.values(rows).forEach(list=>{
    list.sort((a,b)=>a.r.left-b.r.left);
    for(let i=1;i<list.length;i++)
      if(list[i].r.left < list[i-1].r.right-1)
        overlaps.push(list[i-1].el.className+' / '+list[i].el.className);
  });
  return {docW, scrollW:document.documentElement.scrollWidth, over, clipped, overlaps};
};

for (const [w,h,name] of [[3840,2160,'boardroom TV, 4K'],[2560,1440,'wide monitor'],
                          [1920,1080,'the usual screen'],[1366,768,'an older laptop'],
                          [1100,900,'half a screen'],[820,1180,'a tablet on its side']]){
  const c=await b.newContext({viewport:{width:w,height:h}});
  const p=await c.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.cwd()+'/Mississauga_Morning_Dashboard.html');
  await p.waitForTimeout(1300);
  await p.evaluate(SEED); await p.waitForTimeout(300);

  for (const mode of ['filling it in','on the wall']){
    if (mode==='on the wall') { await p.evaluate(()=>document.body.classList.add('pres-mode'));
      await p.waitForTimeout(250); }
    const s=await p.evaluate(SURVEY);
    const tag=`${name} ${w}×${h} · ${mode}`;
    say(s.scrollW<=s.docW+1, `${tag} — the page does not scroll sideways`
        +(s.scrollW>s.docW+1?` (${s.scrollW} into ${s.docW})`:''));
    say(s.over.length===0, `${tag} — nothing hangs off the edge`
        +(s.over.length?': '+s.over.slice(0,3).join(' | '):''));
    say(s.overlaps.length===0, `${tag} — no card sits on its neighbour`
        +(s.overlaps.length?': '+s.overlaps.slice(0,2).join(' | '):''));
    say(s.clipped.length===0, `${tag} — nothing is cut off`
        +(s.clipped.length?': '+s.clipped.slice(0,3).join(' | '):''));
  }
  say(errs.length===0, `${name} — no errors`+(errs.length?': '+errs.join(' | '):''));
  await c.close();
}
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n');
process.exit(bad?1:0);
