import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error'&&!/ERR_CONNECTION|fonts/.test(m.text()))errs.push(m.text());});
await p.goto('file://'+process.cwd()+'/build_proto.html');
await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(500);

say((await p.$$('.navitem[data-go]')).length===5,'five modules in the rail');
say((await p.$$('.mod.on')).length===1,'exactly one module showing');
const vis=()=>p.$eval('.mod.on',n=>n.dataset.mod);
say(await vis()==='databank','Data Bank opens first');

for (const [mod,heading] of [['morning','Wednesday 19 August'],['sources','Data sources'],
                             ['catalogue','Catalogue'],['people','People'],['databank',null]]){
  await p.$eval(`.navitem[data-go=${mod}]`,n=>n.click()); await p.waitForTimeout(200);
  say(await vis()===mod, `clicking ${mod} opens it`);
  say((await p.$$('.mod.on')).length===1, `and only it`);
  if (heading) say((await p.$eval('.mod.on',n=>n.textContent)).includes(heading),
    `${mod} shows its own content`);
}
say((await p.$eval('#modTitle',n=>n.textContent))==='Data Bank','the header names the module');

/* the product is Score, and nothing on screen still says MaxMetrics */
say((await p.title())==='Score','the browser tab says Score');
say((await p.$eval('.wordmark',n=>n.textContent.trim()))==='Score','so does the wordmark');
say((await p.$eval('#navToggle',n=>n.textContent.trim()))==='S','and the mark is an S');
say(!(await p.$eval('body',n=>n.innerText)).includes('MaxMetrics'),
    'the old name appears nowhere on the page');
say((await p.$$eval('.navitem .lb',n=>n.map(x=>x.textContent))).join(' | ')
      ==='The Morning | Data Bank | Data sources | Catalogue | People | More to come',
    'and the rail reads in the new names');

/* builder controls belong to the builder */
await p.$eval('.navitem[data-go=morning]',n=>n.click()); await p.waitForTimeout(200);
say(await p.$eval('#csvBtn',n=>getComputedStyle(n).display==='none'),
    'Export CSV is hidden outside Data Bank');
await p.$eval('.navitem[data-go=databank]',n=>n.click()); await p.waitForTimeout(200);
say(await p.$eval('#csvBtn',n=>getComputedStyle(n).display!=='none'),'and back when Data Bank opens');

/* the rail expands and remembers */
say(await p.$eval('#appnav',n=>Math.round(n.getBoundingClientRect().width))<80,'rail starts as icons');
await p.click('#navToggle'); await p.waitForTimeout(300);
say(await p.$eval('#appnav',n=>Math.round(n.getBoundingClientRect().width))>180,'and opens to names');
say((await p.$eval('.navitem[data-go=databank] .lb',n=>getComputedStyle(n).opacity))==='1',
    'labels visible when open');
await p.reload(); await p.waitForTimeout(700);
say(await p.$eval('#appnav',n=>n.classList.contains('wide')),'it remembers being open');
say(await vis()==='databank','and remembers which module you were in');

/* the builder still works inside the shell */
await p.$eval('[data-key=otif]',n=>n.click()); await p.waitForTimeout(250);
say((await p.$$('.tokn.m')).length>=1,'the builder still takes a measure');
say((await p.$$('.chartbox svg')).length===1,'and still draws');
say((await p.$$('#catTbl tr')).length===9,'the catalogue lists all 8 metrics plus a header');

say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n'); process.exit(bad?1:0);
