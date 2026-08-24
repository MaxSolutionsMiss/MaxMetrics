import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(o,t)=>{console.log((o?'  ok   ':'  FAIL ')+t);if(!o)bad++;};
const p=await b.newPage({viewport:{width:1400,height:900},deviceScaleFactor:2});
p.on('pageerror',e=>say(false,'error: '+e.message));
await p.goto('file://'+process.cwd()+'/'+(process.argv[2]||'Mississauga_Morning_Dashboard.html'));
await p.waitForTimeout(1400);
const vis=a=>p.$eval(`.rail-act[data-act=${a}]`,n=>getComputedStyle(n).display!=='none');

say((await p.$$('.dock')).length===0,'the raft in the corner is gone');
say((await p.$$('.rail .rail-act')).length===3,'three buttons live in the rail');
say((await p.$$('.rail .rail-sep')).length===1,'with a divider under the sections');
say(await vis('edit')&&await vis('save')&&await vis('present'),
    'reading: Edit Mode, Save and Present all there');

/* order inside the strip: sections, divider, buttons, tuck */
const order=await p.$$eval('.rail > *',n=>n.map(x=>
  x.classList.contains('rail-act')?'act:'+x.dataset.act
  :x.classList.contains('rail-sep')?'—'
  :x.classList.contains('rail-tuck')?'tuck':'sec'));
say(order.join(' ')==='sec sec sec sec sec sec sec — act:edit act:save act:present tuck',
    'in the right order — '+order.join(' '));

await p.$eval('.rail-act[data-act=edit]',n=>n.click()); await p.waitForTimeout(500);
say(!(await vis('edit'))&&await vis('save')&&await vis('present'),
    'in Edit Mode only Edit steps aside');
say(await p.$eval('#draftBtn',n=>!n.classList.contains('hidden')),'the header agrees');

/* it must stay put and keep working at the foot of a long page */
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
await p.waitForTimeout(400);
const box=await p.$eval('.rail',n=>{const r=n.getBoundingClientRect();
  return {left:Math.round(r.left),mid:Math.round(r.top+r.height/2),h:Math.round(r.height)};});
say(box.left<30,'still pinned to the left edge');
say(Math.abs(box.mid-450)<60,'still centred vertically — '+JSON.stringify(box));
say(box.h<=900-28,'and it fits the screen');

await p.evaluate(()=>{DIR={name:'Data',getDirectoryHandle(){return Promise.resolve(DIR)},
  getFileHandle:()=>Promise.resolve({createWritable:async()=>({write:async()=>{},close:async()=>{}}),
    getFile:async()=>({text:async()=>'{}'})})};});
await p.fill('#i-short','5');
await p.$eval('.rail-act[data-act=save]',n=>n.click()); await p.waitForTimeout(800);
say(/Saved to Data/.test(await p.$eval('#toast',n=>n.textContent)),'Save from the rail really saves');

/* hovering opens the labels for buttons as well as sections */
await p.hover('.rail'); await p.waitForTimeout(400);
say(await p.$eval('.rail-act[data-act=save]',n=>n.getBoundingClientRect().width>150),
    'hovering names the buttons too');
await p.screenshot({path:'shot_rail_open.png',clip:await p.$eval('.rail',n=>{
  const r=n.getBoundingClientRect();return {x:0,y:r.y-10,width:r.width+40,height:r.height+20};})});

/* tucking hides the section list but must not hide the buttons */
await p.click('.rail-tuck'); await p.waitForTimeout(350);
say(await vis('save'),'tucked away, the buttons stay');
say(!(await p.$eval('.rail a[href^="#"]',n=>getComputedStyle(n).display!=='none')),
    'and the section list goes');
/* Publish used to end the editing for you. Save has no business doing that —
   you save half way through filling the morning in and carry on. Present is
   what ends it. */
await p.$eval('.rail-act[data-act=save]',n=>n.click()); await p.waitForTimeout(800);
say(!(await vis('edit'))&&await vis('save')&&await vis('present'),
    'saving leaves you in Edit Mode, still able to save again');
await p.$eval('.rail-act[data-act=present]',n=>n.click()); await p.waitForTimeout(900);
say(await p.$eval('body',n=>n.classList.contains('pres-mode')),
    'and Present is what puts it on the wall');
say(await vis('edit'),'which hands Edit Mode back');
await b.close();
console.log(bad?`\n${bad} failed\n`:'\nall good\n'); process.exit(bad?1:0);
