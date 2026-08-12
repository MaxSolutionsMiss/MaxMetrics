// Where a file posted by a flow lands.
//
// A Power Automate flow reads the plant's workbooks out of SharePoint at half past five and
// POSTs each one here. This function does not read them. It checks the key, works out which
// linked file it is looking at, and parks the bytes in the same private bucket `pull` uses —
// after which `pull` hands them to the page, and the page reads them with `js/import.js`.
//
// The earlier version of this file carried its own copy of the parser, because Supabase's
// bundler refuses an `https` import and a server that writes mornings unattended has to be
// able to read a workbook. That is nine hundred lines of parser duplicated into Deno, kept
// in step by a sync script, and it was always the weakest part of the design: this project's
// first rule is that there is one parser and the browser runs it. A second copy that drifts
// by one column is a number that disagrees with itself and nobody can say why.
//
// So the split is the same one `pull` already makes. The server fetches and stores; the page
// parses and writes. The cost is honest and worth stating: a morning is filled when somebody
// opens the dashboard and presses Pull data, not at 5:30 while the plant is empty. The files
// are already here by then, which is the part that could not be done any other way.

import { createClient } from 'npm:@supabase/supabase-js@2.52.1';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('MAXMETRICS_INGEST_KEY') ?? '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status, headers: { 'content-type': 'application/json' },
  });

// A workbook is a ZIP, so it starts with PK. Anything else — most often a sign-in page
// served with a cheerful 200 — is refused here rather than stored and discovered later.
const looksLikeWorkbook = (bytes: Uint8Array) =>
  bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

// Which linked file this is. The flow sends a filename; the plant's sources carry names and
// kinds. Matching on the words that actually distinguish them beats asking the flow to know
// our identifiers — a person renaming a source in Configure must not break a flow nobody
// remembers how to edit.
function sourceFor(name: string, sources: { id: string; kind: string; name: string }[]) {
  const file = name.toLowerCase();
  const has = (...words: string[]) => words.some(w => file.includes(w));
  const kind = has('dor') ? 'dor'
    : has('otif', 'otd') ? 'otif'
    : has('kpi') ? 'kpi'
    : '';
  if (kind) {
    const match = sources.find(s => s.kind === kind);
    if (match) return match;
  }
  // Failing that, the source whose own name is closest to the file's.
  const stem = file.replace(/\.[a-z]+$/, '');
  return sources.find(s => stem.includes(s.name.toLowerCase()))
      ?? sources.find(s => s.name.toLowerCase().includes(stem))
      ?? null;
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'POST a file.' }, 405);

  // A shared secret rather than a signed-in user: the caller is a flow, not a person.
  // Compared in full rather than short-circuiting, so a wrong key cannot be found a
  // character at a time.
  const offered = request.headers.get('x-maxmetrics-key') ?? '';
  if (!SECRET || offered.length !== SECRET.length ||
      !offered.split('').reduce((same, c, i) => same & (c === SECRET[i] ? 1 : 0), 1)) {
    return json({ error: 'Not authorised.' }, 401);
  }

  const location = request.headers.get('x-maxmetrics-location') ?? '';
  const name = request.headers.get('x-maxmetrics-filename') ?? 'upload.xlsx';
  if (!location) return json({ error: 'x-maxmetrics-location is required.' }, 400);

  // Three shapes, because Power Automate sends whichever it feels like.
  //
  // Dropping "File content" into an HTTP body sometimes posts the bytes, sometimes posts
  // Power Automate's own wrapper - `{"$content": "UEsDBB…", "$content-type": "…"}` - and
  // sometimes posts the base64 on its own. All three are the same workbook, and refusing
  // two of them would send somebody back into the designer to guess which one they had.
  let bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length && !looksLikeWorkbook(bytes)) {
    const text = new TextDecoder().decode(bytes).trim();
    const base64 = text.startsWith('{')
      ? (() => { try { return JSON.parse(text)?.['$content'] ?? ''; } catch { return ''; } })()
      : /^[A-Za-z0-9+/=\s]+$/.test(text) ? text : '';
    if (base64) {
      try {
        const raw = atob(base64.replace(/\s+/g, ''));
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        bytes = out;
      } catch { /* not base64 after all; the check below reports what it really is */ }
    }
  }

  if (!bytes.length) {
    return json({
      error: `${name} arrived with no content.`,
      // The body is the field people leave empty, so say so rather than making them guess.
      fix: 'In the HTTP action, set Body to the File content from Get file content. If the '
         + 'dynamic token will not stick, use the expression '
         + "base64ToBinary(body('Get_file_content')?['$content']).",
    }, 400);
  }
  if (!looksLikeWorkbook(bytes)) {
    return json({
      error: `${name} is not a workbook - it does not start like a ZIP.`,
      firstBytes: Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '),
    }, 422);
  }

  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: sources } = await admin.from('location_sources')
    .select('id, kind, name').eq('location_id', location).order('sort_order');
  if (!sources?.length) {
    return json({ error: `No files are linked to ${location} yet — Configure, then Data.` }, 400);
  }

  const source = sourceFor(name, sources);
  if (!source) {
    return json({
      error: `Nothing at ${location} matches "${name}".`,
      // Saying what it *would* have accepted turns a rejection into an instruction.
      linked: sources.map(s => ({ name: s.name, kind: s.kind })),
    }, 422);
  }

  const path = `${location}/${source.id}.xlsx`;
  const { error: up } = await admin.storage.from('pulls')
    .upload(path, bytes, { upsert: true, contentType: 'application/octet-stream' });
  if (up) return json({ error: up.message }, 500);

  const note = `${Math.round(bytes.length / 1024)} KB delivered as ${name}`;
  await admin.rpc('note_pull', { source: source.id, ok: true, note });

  return json({
    ok: true, at: new Date().toISOString(),
    file: name, matched: source.name, kind: source.kind, bytes: bytes.length,
  });
});
