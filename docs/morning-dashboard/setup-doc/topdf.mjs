import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/doc/handover.html',{waitUntil:'networkidle'});
await p.waitForTimeout(900);
await p.emulateMedia({media:'print'});
await p.pdf({path:'doc/Morning_Dashboard_Setup.pdf',format:'Letter',printBackground:true,
  displayHeaderFooter:true,
  headerTemplate:'<div></div>',
  footerTemplate:'<div style="width:100%;font-family:sans-serif;font-size:7.5pt;color:#8b96a3;padding:0 15mm;display:flex;justify-content:space-between"><span>Mississauga Morning Dashboard &mdash; setup and handover</span><span class="pageNumber"></span></div>',
  margin:{top:'16mm',bottom:'18mm',left:'15mm',right:'15mm'}});
console.log('errors:', errs.length?errs:'none');
await b.close();
