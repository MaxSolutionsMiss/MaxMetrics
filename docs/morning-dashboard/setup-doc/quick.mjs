import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:816,height:1056},deviceScaleFactor:1.7});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/doc/quick.html',{waitUntil:'networkidle'});
await p.emulateMedia({media:'print'});
await p.waitForTimeout(700);
await p.pdf({path:'doc/Morning_Dashboard_Setup.pdf',format:'Letter',printBackground:true,
  margin:{top:'11mm',bottom:'12mm',left:'11mm',right:'11mm'}});
console.log('errors:', errs.length?errs:'none');
console.log('flow height', await p.evaluate(()=>document.body.scrollHeight));
await p.screenshot({path:'doc/qpreview.png',fullPage:true});
await b.close();
