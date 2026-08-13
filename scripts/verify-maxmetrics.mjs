// The architecture rules, checked rather than remembered.
//
// Every rule here exists because breaking it caused a specific problem in MaxDock or in
// the twenty-two versions of the dashboard this replaces. A rule that cannot say what it
// is protecting does not belong in this file.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, extname, sep } from 'node:path';

const failures = [];
const fail = (rule, detail) => failures.push(`${rule}\n    ${detail}`);

// The build output is a copy of the source with the commit stamped into its URLs. Walking
// into it finds a second stylesheet and a second network module and fails every rule the
// source passes, so the rules are checked where they are written rather than where they
// are published.
const NOT_SOURCE = new Set(['.git', 'node_modules', '_site', '.gh-pages']);

// And nothing git is ignoring.
//
// The browser harness writes `_dash.html` and `_stub-db.js` to the root — a whole second
// page that loads a second network module, which is exactly what these rules exist to
// forbid and exactly what this file is not. Listing them here by name would mean this check
// and `.gitignore` drifting apart; asking git is asking the one authority on what is source.
// Where git is not available the answer is "nothing", which is the behaviour this had before.
const IGNORED = (() => {
  try {
    return new Set(execSync('git ls-files --others --ignored --exclude-standard --directory',
      { encoding: 'utf8' }).split('\n').map(line => line.replace(/\/$/, '')).filter(Boolean));
  } catch { return new Set(); }
})();

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (NOT_SOURCE.has(entry)) continue;
    const path = join(dir, entry);
    if (IGNORED.has(path) || IGNORED.has(path.replace(/^\.\//, ''))) continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const files = walk('.');
const read = path => readFileSync(path, 'utf8');
const byExtension = ext => files.filter(f => extname(f) === ext);

// One stylesheet. Two would drift apart, and the second would win by accident.
const stylesheets = byExtension('.css');
if (stylesheets.length !== 1 || !stylesheets[0].endsWith('maxmetrics.css')) {
  fail('One stylesheet only', `found: ${stylesheets.join(', ') || 'none'}`);
}

// One network module. Retries, connection state and error wording have to live in one
// place or the app tells the reader two different stories about the same failure.
const networkFiles = files.filter(f => /supabase\.createClient/.test(f.endsWith('.js') ? read(f) : ''));
if (networkFiles.length !== 1 || !networkFiles[0].endsWith(join('js', 'db.js'))) {
  fail('One network module only', `createClient appears in: ${networkFiles.join(', ') || 'none'}`);
}

// No build step. The file in the repository is the file the browser runs, which is what
// makes this deployable without anyone's toolchain.
for (const forbidden of ['package.json', 'vite.config.js', 'webpack.config.js', 'tsconfig.json']) {
  if (files.some(f => f.endsWith(forbidden))) fail('No build tooling', `found ${forbidden}`);
}

// !important usually means two rules are fighting, and the fix is to stop the fight.
// These four cases are not fights — each one is a declaration that must outrank whatever
// a component happens to set, which is the only thing !important is actually for.
const IMPORTANT_ALLOWED = [
  { match: /prefers-reduced-motion/,   why: 'must beat any animation a component declares' },
  { match: /^\.hide\b/,                why: 'hidden is hidden, whatever the display rule was' },
  { match: /body:not\(\.editing\)/,    why: 'edit fields stay closed regardless of card layout' },
  { match: /^body\[data-view="fill"\]/, why: 'the entry screen is always open for entry' },
  { match: /^\.snap__b\{grid-area:auto/,  why: 'one column on a phone beats a hand-placed block' },
  { match: /\.view-only\{display:none/,  why: 'a value steps aside for the field that replaces it' },
  { match: /grid-template-columns:1fr!important/, why: 'one column on a phone beats every per-section grid' },
];
for (const path of stylesheets) {
  read(path).split('\n').forEach((line, i) => {
    if (!line.includes('!important')) return;
    if (IMPORTANT_ALLOWED.some(rule => rule.match.test(line.trim()))) return;
    fail('No !important', `${path}:${i + 1}  ${line.trim()}`);
  });
}

// Judgement lives in one place. A card and the dot beside its section must never be able
// to disagree about the same number.
for (const path of byExtension('.js')) {
  if (path.endsWith('readings.js') || path.endsWith('verify-maxmetrics.mjs')) continue;
  const source = read(path);
  for (const [i, line] of source.split('\n').entries()) {
    if (/>=\s*98\b/.test(line) || /<=\s*0\.85\b/.test(line)) {
      fail('Thresholds belong to band() in readings.js', `${path}:${i + 1}  ${line.trim()}`);
    }
  }
}

// Nothing may call a function its module never declares and never imports.
//
// `drawImport()` was lost in a refactor and stayed lost through a release: every caller
// threw on its first line, a throw inside a click handler is silent, and Import and Export
// simply stopped doing anything. `node --check` cannot catch it — the file parses — so the
// rule that would have caught it lives here.
//
// The naive version of this check reads `minmax(`, `repeat(` and `coalesce(` out of CSS
// and SQL held in strings and fails on all of them, so the source is reduced to code
// first: comments and string bodies are blanked, and the `${...}` holes inside template
// literals are kept, because those are code and are exactly where this app writes most of
// its calls.
function codeOnly(source) {
  let out = '', i = 0;
  const stack = [];                       // 'tpl' for template text, {depth} for a ${ } hole
  const inTemplate = () => stack[stack.length - 1] === 'tpl';
  // A slash starts a regular expression rather than a division when the last thing that
  // mattered was an operator or an opening bracket. Without this, the `"` inside /[&<>"]/
  // opens a string that swallows the rest of the file.
  const startsRegex = () => {
    const before = out.replace(/\s+$/, '');
    return before === '' || /[(,=:[!&|?{};+\-*%<>~^]$/.test(before) || /\breturn$/.test(before);
  };
  while (i < source.length) {
    const c = source[i], n = source[i + 1];
    if (inTemplate()) {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      if (c === '$' && n === '{') { stack.push({ depth: 0 }); out += ' '; i += 2; continue; }
      i++; continue;                      // template text is not code
    }
    if (c === '/' && n === '/') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '/' && startsRegex()) {
      i++;
      let inClass = false;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '[') inClass = true;
        else if (source[i] === ']') inClass = false;
        else if (source[i] === '/' && !inClass) break;
        else if (source[i] === '\n') break;
        i++;
      }
      i++; while (/[a-z]/.test(source[i] || '')) i++;
      out += ' '; continue;
    }
    if (c === "'" || c === '"') {
      const quote = c; i++;
      while (i < source.length && source[i] !== quote) { if (source[i] === '\\') i++; i++; }
      i++; out += '""'; continue;
    }
    if (c === '`') { stack.push('tpl'); i++; continue; }
    const top = stack[stack.length - 1];
    if (top && typeof top === 'object') {
      if (c === '{') { top.depth++; out += c; i++; continue; }
      if (c === '}') {
        if (top.depth === 0) { stack.pop(); out += ' '; i++; continue; }
        top.depth--; out += c; i++; continue;
      }
    }
    out += c; i++;
  }
  return out;
}

const GLOBALS = new Set(['Number','String','Boolean','Array','Object','Math','JSON','Date',
  'Promise','Map','Set','RegExp','Error','parseInt','parseFloat','isNaN','isFinite',
  'setTimeout','clearTimeout','setInterval','clearInterval','fetch','structuredClone',
  'encodeURIComponent','decodeURIComponent','addEventListener','removeEventListener',
  'getComputedStyle','URL','CSS','FormData','Blob','File','Intl',
  'requestAnimationFrame','queueMicrotask','scrollTo','alert','confirm','prompt','print','atob','btoa',
  'if','for','while','switch','catch','return','typeof','function','await','super','class','of',
  'async','import','yield','new','delete','void','in','instanceof','do','else','try']);

for (const path of byExtension('.js')) {
  if (path.includes('verify-maxmetrics')) continue;
  const source = codeOnly(read(path));
  const known = new Set(GLOBALS);
  for (const re of [/(?:function|class)\s+([A-Za-z_$][\w$]*)/g,
                    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
                    /import\s*{([^}]*)}/g,
                    /import\s+([A-Za-z_$][\w$]*)/g,
                    /(?:\(|,)\s*\.{0,3}([A-Za-z_$][\w$]*)\s*(?:=[^,)]*)?(?=[,)])/g,
                    /{([^}]*)}\s*=/g,
                    /([A-Za-z_$][\w$]*)\s*=>/g]) {
    for (const match of source.matchAll(re)) {
      for (const name of String(match[1]).split(/[,\s]+/)) {
        const bare = name.replace(/^\.{3}/, '').split(' as ').pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(bare)) known.add(bare);
      }
    }
  }
  const called = new Set();
  for (const match of source.matchAll(/(^|[^.\w$])([a-z_$][\w$]*)\s*\(/g)) called.add(match[2]);
  for (const name of called) {
    if (!known.has(name)) fail('Calls a function that is never declared', `${path}  ${name}()`);
  }

  // The same mistake, one letter case over.
  //
  // The rule above only looks at names that are called and start lower-case, so a rewrite
  // that deleted a lookup table left `PANE_BODY[state.pane]` pointing at nothing and this
  // script said every rule held. The Configure screen threw on load. A table read or called
  // is the same class of error as a function called; the shape is `NAME[` or `NAME(`, which
  // is narrow enough not to fire on an object key or a label.
  const reached = new Set();
  for (const match of source.matchAll(/(^|[^.\w$])([A-Z][A-Z0-9_]*[A-Z0-9])\s*[[(]/g)) {
    reached.add(match[2]);
  }
  for (const name of reached) {
    if (!known.has(name)) fail('Reads a table that is never declared', `${path}  ${name}`);
  }
}

// The service-role key must never reach a browser. The publishable key is meant to ship;
// the other one bypasses every policy in the database.
for (const path of files) {
  if (extname(path) !== '.js' && extname(path) !== '.html') continue;
  const source = read(path);
  if (/service_role|SUPABASE_SERVICE/.test(source)) {
    fail('No service-role key in client code', path);
  }
  if (/sb_secret_/.test(source)) fail('No secret key in client code', path);
}

// Every page loads the Supabase library before the module that expects it.
for (const path of byExtension('.html')) {
  const source = read(path);
  if (!/type="module"/.test(source)) continue;
  const library = source.indexOf('supabase.min.js');
  const firstModule = source.indexOf('type="module"');
  if (library === -1) fail('Page loads the Supabase library', path);
  else if (library > firstModule) fail('Supabase library loads before page modules', path);
}

// Every field the product draws says what it is.
//
// Thirty-two of the sixty-six controls on the entry screen had no label, no `aria-label` and
// no id — a `<span>` above a box reads perfectly and ties nothing to it. That breaks a
// screen reader, and it also breaks voice control and the browser's own autofill for
// everybody else. An `<input>` or `<select>` or `<textarea>` in a page module is checked for
// one of the three ways of saying what it is.
for (const path of byExtension('.js')) {
  if (path.includes('verify-maxmetrics')) continue;
  const source = read(path);
  for (const match of source.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = match[2];
    if (/aria-label|\bid=|type="(hidden|checkbox|radio)"/.test(attrs)) continue;
    // A control wrapped in its own `<label>` is labelled by it. The wrapper opens on an
    // earlier line, so the test is whether one is open where this control is written.
    const before = source.slice(0, match.index);
    const opened = (before.match(/<label\b/g) || []).length;
    const closed = (before.match(/<\/label>/g) || []).length;
    if (opened > closed) continue;
    fail('Every field says what it is',
         `${path}  <${match[1]}${attrs.replace(/\s+/g, ' ').slice(0, 60)}>`);
  }
}

// The server reads a workbook with the same code the page does.
//
// The ingest function cannot import across the `supabase/` boundary — Deno bundles what
// sits under the function folder — so the two parser modules are copied there. A copy
// drifts, and a drifted parser means the number the room accepted on Tuesday and the
// number the flow wrote on Wednesday came from different code. So the copy is checked
// rather than trusted: run `node scripts/sync-shared.mjs` after editing either module.
for (const shared of ['import.js', 'xlsx.js']) {
  const source = join('js', shared);
  for (const copy of files.filter(path =>
      path.startsWith(join('supabase', 'functions')) && path.endsWith(`${sep}${shared}`))) {
    if (read(source) !== read(copy)) {
      fail('Edge-function copy matches its source',
           `${copy} differs from ${source} — run scripts/sync-shared.mjs`);
    }
  }
}

if (failures.length) {
  console.error(`\nMaxMetrics conformance: ${failures.length} problem(s)\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}
console.log('MaxMetrics conformance: all rules hold.');
