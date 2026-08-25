// The audit cases, run against whichever copy of the file is passed in.
//   1  a failed read during Save must not write other people's comments away
//   2  a comment typed but not yet saved must survive changing the day and back
//   3  two healthy saves must still pool both people's comments
import { chromium } from 'playwright';

const FILE = 'file://' + (process.argv[2]
  || '/home/user/MaxMetrics/docs/morning-dashboard/Morning_Dashboard.html');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const DISK = {};
let readFails = false;

async function person(name, ini) {
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  !! ' + name + ': ' + e.message));
  await p.exposeFunction('_read', n => {
    if (readFails) { const e = new Error('device not ready'); e.name = 'NotReadableError'; throw e; }
    return DISK[n] ?? null;
  });
  await p.exposeFunction('_write', (n, t) => { DISK[n] = t; });
  await p.exposeFunction('_exists', n => Object.prototype.hasOwnProperty.call(DISK, n));
  await p.goto(FILE);
  await p.waitForTimeout(1200);
  await p.evaluate(({ name, ini }) => {
    localStorage.setItem(meKey, JSON.stringify({ name, ini }));
    DIR = {
      name: 'Data',
      getDirectoryHandle() { return Promise.resolve(DIR); },
      async getFileHandle(n, o) {
        const there = await window._exists(n);
        if (!there && !(o && o.create)) { const e = new Error('nope'); e.name = 'NotFoundError'; throw e; }
        return {
          createWritable: async () => ({
            write: async t => { await window._write(n, t); }, close: async () => {},
          }),
          getFile: async () => ({ text: async () => window._read(n) }),
        };
      },
    };
  }, { name, ini });
  await p.evaluate(() => { window.checkFolderThen = go => go(); });
  return p;
}

const comment = async (p, th, text) => {
  await p.$eval(`[data-thread="${th}"] .say input`, (i, t) => {
    i.value = t; i.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await p.click(`[data-thread="${th}"] .say button`);
  await p.waitForTimeout(600);
};
const save = async p => { await p.click('#draftBtn'); await p.waitForTimeout(900); };
const clearModal = p => p.evaluate(() => document.querySelector('.mdl-bg')?.remove());
const inFile = () => {
  const k = Object.keys(DISK).filter(x => /^\d{4}-/.test(x))[0];
  if (!k) return '(no file)';
  const c = JSON.parse(DISK[k]).comments || {};
  return Object.values(c).flat().map(x => `${x.ini}:${x.text}`).sort().join(', ') || '(none)';
};
const onScreen = (p, th) => p.$$eval(`[data-thread="${th}"] .msgs .msg-t, [data-thread="${th}"] .msgs *`,
  n => n.map(x => x.textContent).join(' | '));

let fails = 0;
const check = (ok, label, detail) => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails++;
};

const jack = await person('Jack', 'JR');
const mary = await person('Mary', 'MO');
const th = 'safety';

console.log('\n1 ── a failed read during Save');
await comment(mary, th, 'Mary one');
await save(mary);
await comment(jack, th, 'Jack one');
readFails = true;
await save(jack);
readFails = false;
check(inFile().includes('Mary one'), "Mary's comment still in the file", inFile());
await clearModal(jack);

console.log('\n2 ── a comment typed but not saved, then the day is changed and changed back');
await comment(jack, th, 'Jack unsaved');
const today = await jack.$eval('#dashDate', n => n.value);
await jack.$eval('#dashDate', n => {
  n.value = '2026-08-01'; n.dispatchEvent(new Event('change', { bubbles: true }));
});
await jack.waitForTimeout(900);
await jack.$eval('#dashDate', (n, d) => {
  n.value = d; n.dispatchEvent(new Event('change', { bubbles: true }));
}, today);
await jack.waitForTimeout(900);
const screen = await onScreen(jack, th);
check(screen.includes('Jack unsaved'), 'the unsaved comment is still on screen',
  screen.includes('Jack unsaved') ? '' : screen.slice(0, 90) || '(nothing)');
check(screen.includes('Mary one'), "and Mary's saved one came in with it");

console.log('\n3 ── both save, drive healthy');
await save(jack);
await clearModal(jack);
check(inFile().includes('Mary one') && inFile().includes('Jack one'),
  'both people pooled in the file', inFile());

console.log(fails ? `\n${fails} FAILED\n` : '\nall good\n');
await b.close();
process.exit(fails ? 1 : 0);
