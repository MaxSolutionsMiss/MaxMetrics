import { chromium } from 'playwright';
const F='file:///home/user/MaxMetrics/docs/morning-dashboard/Morning_Dashboard.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1500,height:950},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(F); await p.waitForTimeout(1500);
await p.evaluate(()=>document.querySelector('.mdl-bg')?.remove());

// 1. the header, no folder yet — this is what a fresh PC looks like
await p.locator('#topHdr').screenshot({path:'doc/f-header.png'});
await p.locator('#folderBar').screenshot({path:'doc/f-redbar.png'});

// 2. the header once a folder is attached
await p.evaluate(()=>{
  DIR={name:'Daily Morning Dashboard',getDirectoryHandle(){return Promise.resolve(DIR)},
    getFileHandle:()=>Promise.resolve({createWritable:async()=>({write:async()=>{},close:async()=>{}}),
      getFile:async()=>({text:async()=>'{}'})})};
  folderBadge();
});
await p.waitForTimeout(300);
await p.locator('#topHdr').screenshot({path:'doc/f-header-ok.png'});

// 3. Check this PC
await p.evaluate(()=>checkThisPC()); await p.waitForTimeout(900);
await p.locator('.mdl').screenshot({path:'doc/f-checkpc.png'});
await p.evaluate(()=>document.querySelector('.mdl-bg')?.remove());

// 4. a comment thread, for the "using it" part
await p.evaluate(()=>{
  localStorage.setItem('dash_me',JSON.stringify({name:'Jehnae Resa',ini:'JR'}));
  addComment('staffing','Angie: off Aug. 27 and 28');
  addComment('staffing','Anton P.: off this week');
});
await p.waitForTimeout(400);
await p.locator('#staffingCard, .notes-card').first().screenshot({path:'doc/f-comments.png'}).catch(()=>{});
await b.close();
console.log('captured');
