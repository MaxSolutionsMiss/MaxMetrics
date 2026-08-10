// Build the static site into `_site/`.
//
// There is no build step in the sense of compiling anything — the file in the repository
// is the file the browser runs, and that is deliberate. This does one thing the source
// tree must not: it stamps every asset URL with the commit.
//
// Without the stamp a deploy changes no URL. A browser that already holds the stylesheet
// and the modules keeps serving them, and the plant reloads the page on Monday morning and
// sees Friday's release. Import specifiers are stamped too: versioning the <script> tag
// alone would leave every module it imports cached, which is the same bug with an extra
// step in front of it.
//
// The stamping is applied to the copy, never to the source, so the paths in the repository
// stay clean and a person running `python3 -m http.server` sees no query strings at all.

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const OUT = '_site';
const COPY = ['app', 'assets', 'js'];

const version = process.env.MAXMETRICS_VERSION
  || execSync('git rev-parse --short=12 HEAD', { encoding: 'utf8' }).trim();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync('index.html', join(OUT, 'index.html'));
for (const directory of COPY) cpSync(directory, join(OUT, directory), { recursive: true });
// GitHub Pages runs Jekyll over a branch unless told not to, and Jekyll drops every file
// and folder whose name starts with an underscore. Nothing here is named that way today,
// but the cost of the file is nothing and the cost of finding out the hard way is a
// missing asset on a wall at seven in the morning.
writeFileSync(join(OUT, '.nojekyll'), '');

function walk(directory, out = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const files = walk(OUT);
const edit = (path, change) => {
  const before = readFileSync(path, 'utf8');
  const after = change(before);
  if (after !== before) writeFileSync(path, after);
};

for (const path of files.filter(f => extname(f) === '.html')) {
  edit(path, source => source
    .replace(/(href="(?:\.\.\/)?assets\/maxmetrics\.css)"/g, `$1?v=${version}"`)
    .replace(/(src="(?:\.\.\/)?js\/[^"]*\.js)"/g, `$1?v=${version}"`));
}
for (const path of files.filter(f => extname(f) === '.js')) {
  edit(path, source => source.replace(/(from '\.\.?\/[^']+\.js)'/g, `$1?v=${version}'`));
}

// Two things that have gone wrong before, so they are checked rather than trusted.
const problems = [];
for (const path of files) {
  const source = readFileSync(path, 'utf8');
  // The Supabase CDN tag is not ours to version, and a query string on it is a cache miss
  // against somebody else's server every time the plant opens the page.
  if (/supabase\.min\.js\?v=/.test(source)) problems.push(`${path}: stamped the Supabase CDN tag`);
  if (extname(path) === '.js' && /from '\.\.?\/[^']+\.js'/.test(source)) {
    problems.push(`${path}: an import specifier was missed`);
  }
}
if (problems.length) {
  console.error('\nBuild refused:\n');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(`Built ${OUT}/ at ${version} — ${files.length} files.`);
