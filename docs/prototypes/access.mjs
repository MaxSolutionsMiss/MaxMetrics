import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error'&&!/ERR_CONNECTION|fonts/.test(m.text()))errs.push(m.text());});
await p.goto('file://'+process.cwd()+'/build_proto.html');
await p.evaluate(()=>localStorage.clear()); await p.reload();
await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(600);

const asUser = async id => { await p.evaluate(()=>{document.getElementById('whoMenu').hidden=false;});
  await p.$eval(`[data-user=${id}]`,n=>n.click()); await p.waitForTimeout(350); };
const locs  = () => p.$$eval('#locSel option',n=>n.map(o=>o.textContent));
const mods  = () => p.$$eval('.navitem[data-go]',n=>n.filter(x=>getComputedStyle(x).display!=='none').map(x=>x.dataset.go));
const total = () => p.evaluate(()=>compute().grand.cartons);
const caption = () => p.$eval('.viz-h .rng',n=>n.textContent.trim());
const rows    = () => p.$eval('.stamp',n=>n.textContent.replace(/\s+/g,' ').trim());

console.log('\n── Javad · Owner, both plants ──');
say((await mods()).length===5,'sees all five modules');
say((await locs()).join()==='Mississauga,Brampton','can switch between two plants');
say(!(await p.$eval('#locSel',n=>n.disabled)),'the picker is live');
say(await p.$eval('#roFlag',n=>getComputedStyle(n).display==='none'),'no read-only badge');
const missCartons = await total();
say(missCartons>0,'Mississauga has data — '+Math.round(missCartons).toLocaleString()+' cartons');
say((await caption()).startsWith('Mississauga'),'the chart says which plant it is');
const missRows = await rows();
await p.selectOption('#locSel','Brampton'); await p.waitForTimeout(350);
const bramCartons = await total();
say((await caption()).startsWith('Brampton'),
  'and it changes with the plant, so Brampton is never labelled Mississauga — "'+await caption()+'"');
say((await rows())!==missRows,'the row count moves too — '+await rows());
say(bramCartons>0 && bramCartons<missCartons,
  'Brampton is a smaller plant — '+Math.round(bramCartons).toLocaleString()+' cartons');
say((await p.$$eval('.field[data-key=machine]',n=>n.length))===1,'Machine is still offerable');
await p.$eval('[data-key=machine]',n=>n.click()); await p.waitForTimeout(250);
const bramMachines = await p.$$eval('#viz table tr td:first-child',n=>n.map(x=>x.textContent));
say(bramMachines.includes('KBA 28') && !bramMachines.includes('KBA 40'),
  'and Brampton has its own machines — '+bramMachines.filter(x=>x!=='Total').join(', '));
await p.selectOption('#locSel','Mississauga'); await p.waitForTimeout(300);

console.log('\n── Angela · plant manager, Mississauga only ──');
await asUser('angelaw');
say((await locs()).join()==='Mississauga','one plant only');
say(await p.$eval('#locSel',n=>n.disabled),'and no way to switch');
say(!(await mods()).includes('people'),'People is not even in her menu');
say((await mods()).length===4,'the other four are');
say(Math.abs(await total()-missCartons)<1,'she sees the whole Mississauga figure');
say(!(await p.$eval('#saveBtn',n=>getComputedStyle(n).display==='none')),'she can save a view');

console.log('\n── Deep · plant manager, Brampton only ──');
await asUser('deepb');
say((await locs()).join()==='Brampton','Brampton only');
say(Math.abs(await total()-bramCartons)<1,'and sees only Brampton numbers');
const deepM = await p.$$eval('#viz table tr td:first-child',n=>n.map(x=>x.textContent));
say(!deepM.some(m=>/KBA 40|Bobst 106|Jagenberg/.test(m)),
  'no Mississauga machine appears anywhere for him');

console.log('\n── Joe · read only ──');
await asUser('joet');
say(await p.$eval('#saveBtn',n=>getComputedStyle(n).display==='none'),'Save view is gone');
say(await p.$eval('#pinBtn',n=>getComputedStyle(n).display==='none'),'Pin is gone');
say(!(await p.$eval('#roFlag',n=>getComputedStyle(n).display==='none')),'and the header says Read only');
say(!(await p.$eval('#csvBtn',n=>getComputedStyle(n).display==='none')),'he can still export what he can see');
say(!(await mods()).includes('people'),'no People for him either');

console.log('\n── The Morning names the right plant ──');
await asUser('deepb');
await p.$eval('.navitem[data-go=morning]',n=>n.click()); await p.waitForTimeout(300);
say((await p.$eval('#crumb',n=>n.textContent)).startsWith('Brampton'),
  'the breadcrumb says Brampton — "'+await p.$eval('#crumb',n=>n.textContent)+'"');
say((await p.$eval('#morningSub',n=>n.textContent)).includes('Brampton'),
  'and so does the line under the title');
await asUser('angelaw');
say((await p.$eval('#crumb',n=>n.textContent)).startsWith('Mississauga'),
  'switching accounts switches the plant with it');
await asUser('joet');

console.log('\n── it holds across a reload ──');
await p.reload(); await p.waitForTimeout(700);
say((await p.$eval('#whoName',n=>n.textContent))==='Joe Tran','still signed in as Joe');
say(await p.$eval('#saveBtn',n=>getComputedStyle(n).display==='none'),'still without Save');
/* and an account cannot reach a module by URL */
await p.goto('file://'+process.cwd()+'/build_proto.html#people'); await p.waitForTimeout(700);
say((await p.$eval('.mod.on',n=>n.dataset.mod))!=='people',
  'and cannot reach People by typing the address');

say(errs.length===0,'no errors'+(errs.length?': '+errs.join(' | '):''));
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n'); process.exit(bad?1:0);
