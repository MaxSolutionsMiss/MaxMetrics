// Pull data — the fetching half.
//
// "Pull data" has to mean pull data. It meant "open a file chooser", which is a different
// product: the coordinator finishes the DOR at half past seven and wants the dashboard to
// have it, not to be asked where it lives for the four hundredth time.
//
// This function goes and gets the plant's linked files. It does not read them. That split is
// not squeamishness, it is the one rule this product has about parsing: **there is one
// parser and it is `js/import.js`.** A second copy compiled into a function would drift, and
// then the number the room accepted on Tuesday and the number the flow wrote on Wednesday
// would have come from different code. Supabase's bundler will not import a module over
// https, so the choice was a copy or a split, and the split is the honest one.
//
// So: the server fetches (which the browser cannot — SharePoint sends no CORS headers),
// parks each file in a private bucket, and hands back short-lived signed URLs. The page
// downloads those, runs the same parser it has always run, and writes through the same
// paths. One button, no dialogue, and still one parser.
//
// The contract with the outside world is the smallest one every place these files live can
// satisfy: **a URL that returns the bytes of a workbook.** A SharePoint or OneDrive share
// link set to "Anyone with the link" is one, once `download=1` is on it. So is anything a
// Power Automate flow republishes, and so is a file on a web server.
//
// What it cannot do is sign in to a Microsoft tenant. A link that needs a login returns a
// login *page*, and a login page is not a workbook — so that is what the source records,
// in words, rather than the pull quietly doing nothing.

import { createClient } from 'npm:@supabase/supabase-js@2.52.1';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'content-type': 'application/json' },
  });

// A share link opens a viewer; the same link with `download=1` returns the file, which is
// what a parser needs. Everything else is passed through untouched — guessing at URLs is how
// an importer starts lying about what it fetched.
function asDownload(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname;
    if (host.endsWith('sharepoint.com') || host.endsWith('1drv.ms')
        || host.endsWith('onedrive.live.com')) {
      if (!url.searchParams.has('download')) url.searchParams.set('download', '1');
    }
    return url.toString();
  } catch { return raw; }
}

// A workbook is a ZIP, so it starts with PK. Anything else — most often a Microsoft sign-in
// page served with a cheerful 200 — is reported as what it is rather than handed on to fail
// later in a way nobody can read.
const looksLikeWorkbook = (bytes: Uint8Array) =>
  bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const token = request.headers.get('Authorization') ?? '';
  if (!token) return reply({ error: 'Sign in first.' }, 401);
  const asCaller = createClient(URL_, ANON, { global: { headers: { Authorization: token } } });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return reply({ error: 'Sign in first.' }, 401);

  let body: { location?: string; date?: string };
  try { body = await request.json(); } catch { return reply({ error: 'Bad request.' }, 400); }
  const location = String(body.location ?? '');
  const date = String(body.date ?? '');
  if (!location || !date) return reply({ error: 'A plant and a date are needed.' }, 400);

  // May this person write to this plant? Asked of the database with their own token, so a
  // read-only account cannot pull a morning into a plant it may only look at.
  const { data: grant } = await asCaller.from('profile_locations')
    .select('can_edit').eq('profile_id', who.user.id)
    .eq('location_id', location).maybeSingle();
  if (!grant?.can_edit) return reply({ error: 'Your account cannot change this plant.' }, 403);

  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: sources } = await admin.from('location_sources')
    .select('*').eq('location_id', location).eq('enabled', true).order('sort_order');

  const live = (sources ?? []).filter((s: { url?: string }) => (s.url ?? '').trim());
  if (!live.length) {
    return reply({ error: 'No files are linked to this plant yet — Configure, then Data.' }, 400);
  }

  const out: {
    id: string; kind: string; name: string; ok: boolean; note: string;
    url?: string; bytes?: number;
  }[] = [];

  for (const source of live) {
    let note = '';
    let ok = false;
    let signed: string | undefined;
    let size = 0;
    try {
      const response = await fetch(asDownload(source.url), { redirect: 'follow' });
      if (!response.ok) {
        note = `the address answered ${response.status}`;
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        size = bytes.length;
        if (!looksLikeWorkbook(bytes)) {
          note = 'that address returned a web page rather than a workbook — the link almost '
               + 'certainly needs a Microsoft sign-in. Set it to "Anyone with the link".';
        } else {
          // Overwritten every pull. This is a staging area, not an archive: the morning is
          // the record, and keeping a year of eleven-megabyte workbooks to prove it would be
          // a second record that can disagree with the first.
          const path = `${location}/${source.kind}.xlsx`;
          const { error: up } = await admin.storage.from('pulls')
            .upload(path, bytes, { upsert: true, contentType: 'application/octet-stream' });
          if (up) {
            note = up.message;
          } else {
            const { data: link } = await admin.storage.from('pulls')
              .createSignedUrl(path, 600);
            signed = link?.signedUrl;
            note = `${Math.round(size / 1024)} KB`;
            ok = !!signed;
          }
        }
      }
    } catch (cause) {
      note = String((cause as Error).message ?? cause).slice(0, 180);
    }
    out.push({ id: source.id, kind: source.kind, name: source.name, ok, note,
               url: signed, bytes: size });
    await admin.rpc('note_pull', { source: source.id, ok, note });
  }

  return reply({ at: new Date().toISOString(), sources: out });
});
