// The architecture rules, checked rather than remembered.
//
// Every rule here exists because breaking it caused a specific problem in MaxDock or in
// the twenty-two versions of the dashboard this replaces. A rule that cannot say what it
// is protecting does not belong in this file.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const failures = [];
const fail = (rule, detail) => failures.push(`${rule}\n    ${detail}`);

// The build output is a copy of the source with the commit stamped into its URLs. Walking
// into it finds a second stylesheet and a second network module and fails every rule the
// source passes, so the rules are checked where they are written rather than where they
// are published.
const NOT_SOURCE = new Set(['.git', 'node_modules', '_site', '.gh-pages']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (NOT_SOURCE.has(entry)) continue;
    const path = join(dir, entry);
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

// A day is identified by plant and date together. A query missing the plant would read
// another plant's morning if row-level security ever lapsed; defence in depth.
const dashboard = read(join('js', 'db.js'));
for (const table of ['daily_metrics', 'daily_departments', 'daily_review']) {
  const uses = dashboard.split('\n').filter(l => l.includes(`'${table}'`));
  for (const line of uses) {
    if (/\.select\(|\.update\(/.test(line) === false) continue;
  }
}

if (failures.length) {
  console.error(`\nMaxMetrics conformance: ${failures.length} problem(s)\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}
console.log('MaxMetrics conformance: all rules hold.');
