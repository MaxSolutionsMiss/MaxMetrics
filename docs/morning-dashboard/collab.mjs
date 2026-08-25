/* Jack, Mary, Joe and Tom all have the same morning open, all pressing Save.
   One shared folder, four independent browsers. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const say=(ok,t)=>{console.log((ok?'  ok   ':'  FAIL ')+t);if(!ok)bad++;};
const URL='file://'+process.cwd()+'/'+(process.argv[2]||'Morning_Dashboard.html');

/* one folder on disk, shared by every browser in this test */
const DISK={};
async function person(name,ini){
  const ctx=await b.newContext({viewport:{width:1400,height:900}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>say(false,name+' hit an error: '+e.message));
  await p.exposeFunction('_read', n=>DISK[n]??null);
  await p.exposeFunction('_write',(n,t)=>{DISK[n]=t;});
  await p.goto(URL); await p.waitForTimeout(1100);
  await p.evaluate(({name,ini})=>{
    localStorage.setItem(meKey,JSON.stringify({name,ini}));
    DIR={name:'Data',
      getDirectoryHandle(){return Promise.resolve(DIR);},
      async getFileHandle(n,o){
        const cur=await window._read(n);
        if(cur===null&&!(o&&o.create))throw new Error('not found');
        return {createWritable:async()=>({write:async t=>{await window._write(n,t);},close:async()=>{}}),
                getFile:async()=>({text:async()=>window._read(n)})};
      }};
  },{name,ini});
  await p.click('#editBtn'); await p.waitForTimeout(400);
  return p;
}
const save=async p=>{ await p.click('#draftBtn'); await p.waitForTimeout(700); };
const comment=async(p,thread,text)=>{
  await p.$eval(`[data-thread="${thread}"] .say input`,(i,t)=>i.value=t,text);
  await p.click(`[data-thread="${thread}"] .say button`); await p.waitForTimeout(250);
};

console.log('\n── everyone opens the same morning ──');
const jack=await person('Jack Reilly','JR');
const mary=await person('Mary Osei','MO');
const joe =await person('Joe Tran','JT');
const tom =await person('Tom Baird','TB');
const date=await jack.$eval('#dashDate',n=>n.value);

/* each fills in their own part, saving in a staggered order */
await mary.fill('#i-jobs','41'); await mary.fill('#i-late','2');
await comment(mary,'watch','Two late to Brampton');
await save(mary);
say(!!DISK[date+'.json'],'Mary saves first — the file exists');

await jack.fill('#i-short','3');
await comment(jack,'safety','Near-miss on the 17 closed out');
await save(jack);
let f=JSON.parse(DISK[date+'.json']);
say(f.jobs==='41'&&f.late==='2','Jack saving did NOT wipe Mary’s shipping numbers');
say(f.short==='3','and Jack’s own number is in');
say(f.comments.watch?.length===1&&f.comments.safety?.length===1,
    'both comments are in the file, not one replacing the other');

await joe.fill('#i-cartons','18400');
await comment(joe,'staffing','Two off on the gluer');
await save(joe);
f=JSON.parse(DISK[date+'.json']);
say(f.jobs==='41'&&f.short==='3'&&f.cartons==='18400','Joe adds a third set, nothing lost');

await comment(tom,'priorities','Get the 40 back up before second shift');
await save(tom);
f=JSON.parse(DISK[date+'.json']);
const threads=Object.keys(f.comments).sort();
say(threads.join(',')==='priorities,safety,staffing,watch',
    'all four threads survive — '+threads.join(', '));
say(f.jobs==='41'&&f.short==='3'&&f.cartons==='18400','and every number still stands');

console.log('\n── what everybody sees after saving ──');
await save(jack);
const jackSees=await jack.evaluate(()=>({
  jobs:document.getElementById('i-jobs')?.value,
  cartons:document.getElementById('i-cartons')?.value,
  threads:Object.keys(COMMENTS).sort().join(','),
}));
say(jackSees.jobs==='41'&&jackSees.cartons==='18400',
    'Jack presses Save and now sees Mary’s and Joe’s numbers on his screen');
say(jackSees.threads==='priorities,safety,staffing,watch','and everybody’s comments');

console.log('\n── the one real collision ──');
await mary.fill('#i-short','9');   /* Mary types into the box Jack already used */
await save(mary);
f=JSON.parse(DISK[date+'.json']);
say(f.short==='9','two people in the same box: the later save wins, as it must');

console.log('\n── a deletion must stay deleted ──');
await save(joe);                                   /* Joe pulls everyone in */
await joe.$$eval('[data-thread="watch"] [data-del]',n=>n[0].click());
await joe.waitForTimeout(250);
if((await joe.$$('.mdl-bg')).length)
  { await joe.$$eval('.mdl-bg',g=>g[g.length-1].querySelector('[data-ok]').click());
    await joe.waitForTimeout(250); }
await save(joe);
f=JSON.parse(DISK[date+'.json']);
say(!(f.comments.watch||[]).length,'Joe deletes Mary’s note and it goes');
await save(tom);   /* Tom's copy still had it — this is where it used to come back */
f=JSON.parse(DISK[date+'.json']);
say(!(f.comments.watch||[]).length,'and Tom saving does not resurrect it');

console.log('\n── a fifth person, fresh, reads the lot ──');
const anna=await person('Anna Silva','AS');
await anna.evaluate(async()=>{await pullFromFolder();});
await anna.waitForTimeout(700);
const all=await anna.evaluate(()=>({
  jobs:document.getElementById('i-jobs')?.value,
  short:document.getElementById('i-short')?.value,
  cartons:document.getElementById('i-cartons')?.value,
  comments:Object.keys(COMMENTS).sort().join(','),
}));
console.log('   she sees:',JSON.stringify(all));
say(all.jobs==='41'&&all.short==='9'&&all.cartons==='18400','every number from every person');
say(all.comments==='priorities,safety,staffing','and the surviving comments');

await b.close();
console.log(bad?`\n${bad} failed\n`:'\nit is a collaboration tool\n');
process.exit(bad?1:0);
