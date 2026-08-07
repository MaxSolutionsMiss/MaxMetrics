// Copies the two parser modules to where the ingest function can bundle them.
//
// `supabase/functions/ingest` runs in Deno and is bundled from the function folder down,
// so it cannot reach `js/`. Rather than write a second parser for the server — which would
// drift from the one the preview screen shows — the same two files are copied in, and
// conformance fails if the copy ever stops matching. This script is how you make it match.

import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const into = join('supabase', 'functions', '_shared');
mkdirSync(into, { recursive: true });
for (const name of ['import.js', 'xlsx.js']) {
  copyFileSync(join('js', name), join(into, name));
  console.log(`  js/${name} → ${join(into, name)}`);
}
