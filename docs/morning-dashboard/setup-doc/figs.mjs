import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:1200,height:900},deviceScaleFactor:2.4});
await p.goto('file://'+process.cwd()+'/doc/quick.html');
// strip the sheet's own panel so the picture arrives with nothing around it
await p.addStyleTag({content:'.c-fig{background:#fff!important;border:0!important;padding:0!important}'});
await p.waitForTimeout(900);
const figs=await p.$$('.c-fig svg');
console.log('figures:',figs.length);
for(let i=0;i<figs.length;i++) await figs[i].screenshot({path:`mail/s${i+1}.png`, omitBackground:false});
await b.close();
