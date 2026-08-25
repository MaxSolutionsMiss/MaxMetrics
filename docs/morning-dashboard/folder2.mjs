/* Both ways of picking must land in the same place. */
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+process.cwd()+'/'+(process.argv[2]||'Morning_Dashboard.html'));
await p.waitForTimeout(1200);
for(const pick of ['Data','Morning Dashboard']){
  const r=await p.evaluate(async(name)=>{
    const trail=[];
    const leaf={name:'Data',getFileHandle(n){trail.push('write '+n);
      return Promise.resolve({createWritable:async()=>({write:async()=>{},close:async()=>{}})});}};
    DIR={name, getFileHandle:leaf.getFileHandle,
      getDirectoryHandle(n){trail.push('into subfolder "'+n+'"');return Promise.resolve(leaf);}};
    await pushToFolder('2026-08-19',{a:1}); await pushLayout();
    return trail;
  },pick);
  console.log(`picked "${pick}" ->`, r.join('  |  '));
}
await b.close();
