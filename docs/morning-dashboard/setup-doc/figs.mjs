import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:1200,height:900},deviceScaleFactor:2.4});
await p.goto('file://'+process.cwd()+'/doc/quick.html');
await p.waitForTimeout(900);
const figs=await p.$$('.c-fig');
console.log('figures:',figs.length);
for(let i=0;i<figs.length;i++) await figs[i].screenshot({path:`mail/s${i+1}.png`});
await b.close();
