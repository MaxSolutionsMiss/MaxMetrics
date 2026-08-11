// Copies the two parser modules to where each edge function can bundle them.
//
// A function runs in Deno and is bundled from its own folder down, so it cannot reach `js/`
// and it cannot reach a sibling function either. Rather than write a second parser for the
// server — which would drift from the one the preview screen shows — the same two files are
// copied into every function that needs them, and conformance fails if a copy ever stops
// matching. This script is how you make it match.

import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const SHARED = ['import.js', 'xlsx.js'];
// `pull` is not in this list on purpose. It imports the parser straight from the published
// site — the very file the browser is running — so there is no copy of it to keep in step.
// See the note at the top of `pull/index.ts`.
export const WANTS_PARSER = [
  join('supabase', 'functions', '_shared'),
  join('supabase', 'functions', 'ingest'),
];

for (const into of WANTS_PARSER) {
  mkdirSync(into, { recursive: true });
  for (const name of SHARED) {
    copyFileSync(join('js', name), join(into, name));
    console.log(`  js/${name} → ${join(into, name)}`);
  }
}
