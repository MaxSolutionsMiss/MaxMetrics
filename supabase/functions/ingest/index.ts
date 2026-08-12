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
  // The name first, the kind only as a tie-break.
  //
  // Keyword-on-kind was the whole rule and it put two files in one slot. Mississauga keeps
  // `Mississauga KPI's.xlsx` and `Mississauga_Monthly KPI Raw Data.xlsx` in the same folder;
  // both contain "kpi", both resolved to the single source of kind `kpi`, and both were
  // written to `<location>/<that id>.xlsx` — so every morning the flow uploaded one workbook
  // and then overwrote it with the other, and which one survived depended on the order the
  // Apply to each happened to walk the folder in. Nothing reported a fault. One of the two
  // files simply was not there, and it was a different one on different days.
  //
  // Scoring on the words the source's own name and the file's name share fixes that without
  // asking anybody to rename anything: "Monthly KPI raw data" matches all four of its words
  // against the raw-data file and two against the other one.
  const words = (text: string) => new Set(
    text.toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-z0-9]+/).filter(w => w.length > 1));
  const file = words(name);
  const scored = sources.map(source => {
    const own = words(source.name);
    let shared = 0;
    for (const word of own) if (file.has(word)) shared += 1;
    // Over the source's own length, so a two-word name matching both of its words beats a
    // four-word name matching two of its four. The tiny second term breaks ties towards the
    // name that shared more words outright.
    return { source, score: own.size ? shared / own.size + shared / 100 : 0 };
  }).sort((a, b) => b.score - a.score);
  if (scored.length && scored[0].score > 0
      && (scored.length === 1 || scored[0].score > scored[1].score)) {
    return scored[0].source;
  }

  const lower = name.toLowerCase();
  const has = (...w: string[]) => w.some(word => lower.includes(word));
  const kind = has('dor') ? 'dor'
    : has('otif', 'otd') ? 'otif'
    : has('kpi') ? 'kpi'
    : '';
  return (kind && sources.find(s => s.kind === kind)) || null;
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

  // A file nobody has told MaxMetrics about gets a place rather than a refusal.
  //
  // The flow walks a folder, so the way somebody adds a fourth workbook is to put it in the
  // folder - and being told "nothing matches" for doing exactly that is the product blaming
  // a person for using it correctly. It is filed as `other` and kept; Configure, then Data
  // is where somebody says what kind of file it is, and until they do it simply sits there
  // costing nothing.
  let source = sourceFor(name, sources);
  if (!source) {
    const made = await admin.from('location_sources').insert({
      location_id: location, kind: 'other', name: name.replace(/\.[a-z]+$/i, ''),
      url: '', enabled: true, sort_order: sources.length + 1,
    }).select('id, kind, name').single();
    if (made.error) {
      return json({
        error: `Nothing at ${location} matches "${name}", and it could not be added.`,
        why: made.error.message,
        linked: sources.map(s => ({ name: s.name, kind: s.kind })),
      }, 422);
    }
    source = made.data;
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
