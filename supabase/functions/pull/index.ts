// Pull data — the fetching half.
//
// "Pull data" has to mean pull data. This function goes and gets the plant's linked files.
// It does not read them: there is one parser and it is `js/import.js`, and Supabase's
// bundler refuses an `https` import, so the choice was a second copy that would drift or a
// split. The split is the honest one — the server fetches (the browser cannot, SharePoint
// sends no CORS headers), parks each file in a private bucket and hands back short-lived
// signed URLs, and the page reads them with the parser it has always used.
//
// ── Two ways in, and why both are here ──────────────────────────────────────────
//
// **Anonymous.** A share link set to "Anyone with the link" is a URL that returns bytes to
// anybody, so a plain fetch works. Cheapest possible integration and it needs nothing from
// IT — when a tenant allows it.
//
// **Microsoft Graph, app-only.** Max Solutions does not allow it. Every link pasted into the
// screen so far has been `…/:x:/r/sites/…/Shared%20Documents/…` or `…/_layouts/15/Doc.aspx`,
// which are not sharing links at all — they are the file's address inside the library, and
// SharePoint refuses them to anyone without a session. Signed out they answer 403 directly
// and 401 from Supabase's egress. No amount of `download=1` changes that.
//
// So when `MS_TENANT_ID`, `MS_CLIENT_ID` and `MS_CLIENT_SECRET` are set, this authenticates
// as an application and resolves the same URL through Graph's `shares` endpoint, which takes
// *any* SharePoint address the app is permitted to read — including the ones already pasted.
// Nothing on the screen has to change; the links that were refused start working.

import { createClient } from 'npm:@supabase/supabase-js@2.52.1';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MS_TENANT = Deno.env.get('MS_TENANT_ID') ?? '';
const MS_CLIENT = Deno.env.get('MS_CLIENT_ID') ?? '';
const MS_SECRET = Deno.env.get('MS_CLIENT_SECRET') ?? '';
const HAS_GRAPH = !!(MS_TENANT && MS_CLIENT && MS_SECRET);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'content-type': 'application/json' },
  });

const isSharePoint = (raw: string) => {
  try {
    const host = new URL(raw).hostname;
    return host.endsWith('sharepoint.com') || host.endsWith('1drv.ms')
        || host.endsWith('onedrive.live.com');
  } catch { return false; }
};

// A share link opens a viewer; the same link with `download=1` returns the file. Everything
// else is passed through untouched — guessing at URLs is how an importer starts lying about
// what it fetched.
function asDownload(raw: string) {
  try {
    const url = new URL(raw);
    if (isSharePoint(raw) && !url.searchParams.has('download')) {
      url.searchParams.set('download', '1');
    }
    return url.toString();
  } catch { return raw; }
}

// A workbook is a ZIP, so it starts with PK. Anything else — most often a Microsoft sign-in
// page served with a cheerful 200 — is reported as what it is rather than handed on to fail
// later in a way nobody can read.
const looksLikeWorkbook = (bytes: Uint8Array) =>
  bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

// Graph's own way of naming a file by its URL: base64url of the address, with `u!` in front.
function shareId(raw: string) {
  const b64 = btoa(raw).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  return `u!${b64}`;
}

let graphToken: { value: string; until: number } | null = null;
async function tokenForGraph() {
  if (graphToken && graphToken.until > Date.now() + 60_000) return graphToken.value;
  const form = new URLSearchParams({
    client_id: MS_CLIENT,
    client_secret: MS_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error_description?.split('\n')[0] ?? 'Microsoft refused the sign-in.');
  }
  graphToken = { value: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return graphToken.value;
}

async function fetchViaGraph(raw: string) {
  const token = await tokenForGraph();
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${shareId(raw)}/driveItem/content`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: 'follow' });
  if (!response.ok) {
    let why = `Graph answered ${response.status}`;
    try {
      const said = await response.json();
      if (said?.error?.message) why += ` — ${String(said.error.message).slice(0, 140)}`;
    } catch { /* a body that is not JSON tells us nothing more */ }
    throw new Error(why);
  }
  return new Uint8Array(await response.arrayBuffer());
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const token = request.headers.get('Authorization') ?? '';
  if (!token) return reply({ error: 'Sign in first.' }, 401);
  const asCaller = createClient(URL_, ANON, { global: { headers: { Authorization: token } } });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return reply({ error: 'Sign in first.' }, 401);

  let body: { location?: string; date?: string; only?: string };
  try { body = await request.json(); } catch { return reply({ error: 'Bad request.' }, 400); }
  const location = String(body.location ?? '');
  const date = String(body.date ?? '');
  // One source, when the screen is asking about one source.
  const only = String(body.only ?? '');
  if (!location || !date) return reply({ error: 'A plant and a date are needed.' }, 400);

  const { data: grant } = await asCaller.from('profile_locations')
    .select('can_edit').eq('profile_id', who.user.id)
    .eq('location_id', location).maybeSingle();
  if (!grant?.can_edit) return reply({ error: 'Your account cannot change this plant.' }, 403);

  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  // Testing one file tests it whether or not it is switched on — "Pull it" is about the
  // morning routine, and somebody checking a link they have just pasted has not decided
  // about the routine yet.
  let query = admin.from('location_sources').select('*').eq('location_id', location);
  if (!only) query = query.eq('enabled', true);
  const { data: sources } = await query.order('sort_order');

  // A source with no link is not skipped any more. A flow may have delivered its file to
  // the bucket, in which case there is nothing to fetch and everything to hand over - and
  // the plant that gets its workbooks that way would otherwise be told it has nothing
  // linked while three files sat waiting.
  const live = (sources ?? []).filter((s: { id?: string }) => !only || s.id === only);
  if (!live.length) {
    return reply({ error: only ? 'That file is not linked to this plant.'
      : 'No files are set up for this plant yet — Configure, then Data.' }, 400);
  }

  const out: {
    id: string; kind: string; name: string; ok: boolean; note: string;
    how?: string; url?: string; bytes?: number;
  }[] = [];

  for (const source of live) {
    let note = '';
    let how = '';
    let ok = false;
    let signed: string | undefined;
    let size = 0;
    let bytes: Uint8Array | null = null;

    // Anonymous first, because when it works it is the cheapest thing that can work.
    try {
      if (!(source.url ?? '').trim()) throw new Error('no link');
      const response = await fetch(asDownload(source.url), { redirect: 'follow' });
      if (response.ok) {
        const got = new Uint8Array(await response.arrayBuffer());
        if (looksLikeWorkbook(got)) { bytes = got; how = 'link'; }
        else note = 'that link returned a web page rather than a workbook';
      } else {
        note = `the link answered ${response.status}`;
      }
    } catch (cause) {
      note = String((cause as Error).message ?? cause).slice(0, 140);
    }

    // Then Graph, which is the route that works inside a tenant that does not allow
    // anonymous links — which is most of them, and is this one.
    if (!bytes && isSharePoint(source.url)) {
      if (!HAS_GRAPH) {
        note = `${note}. This is a SharePoint address and MaxMetrics is not signed in to `
             + `your tenant. Either share the file as "Anyone with the link", or add the `
             + `Microsoft app registration — see Configure, then Data.`;
      } else {
        try {
          bytes = await fetchViaGraph(source.url);
          if (!looksLikeWorkbook(bytes)) {
            bytes = null;
            note = 'Graph returned something that is not a workbook';
          } else { how = 'Microsoft 365'; note = ''; }
        } catch (cause) {
          note = String((cause as Error).message ?? cause).slice(0, 180);
        }
      }
    }

    // Nothing fetched, but something may already be here.
    //
    // A Power Automate flow signs in as a person Microsoft trusts and posts the workbooks to
    // `ingest`, which parks them in this same bucket. So before reporting a failure, look:
    // a file delivered at half past five is a better answer than a link that answers 401,
    // and from the page's point of view the two are indistinguishable.
    if (!bytes) {
      try {
        const path = `${location}/${source.id}.xlsx`;
        const { data: link } = await admin.storage.from('pulls').createSignedUrl(path, 600);
        if (link?.signedUrl) {
          out.push({ id: source.id, kind: source.kind, name: source.name, ok: true,
                     note: 'delivered', how: 'delivered', url: link.signedUrl, bytes: 0 });
          continue;
        }
      } catch { /* nothing staged, so the fetch failure above stands */ }
    }

    if (bytes) {
      size = bytes.length;
      try {
        // Overwritten every pull. This is a staging area, not an archive: the morning is the
        // record, and keeping a year of eleven-megabyte workbooks to prove it would be a
        // second record that can disagree with the first.
        const path = `${location}/${source.id}.xlsx`;
        const { error: up } = await admin.storage.from('pulls')
          .upload(path, bytes, { upsert: true, contentType: 'application/octet-stream' });
        if (up) note = up.message;
        else {
          const { data: link } = await admin.storage.from('pulls').createSignedUrl(path, 600);
          signed = link?.signedUrl;
          note = `${Math.round(size / 1024)} KB via ${how}`;
          ok = !!signed;
        }
      } catch (cause) {
        note = String((cause as Error).message ?? cause).slice(0, 180);
      }
    }

    out.push({ id: source.id, kind: source.kind, name: source.name, ok, note, how,
               url: signed, bytes: size });
    await admin.rpc('note_pull', { source: source.id, ok, note });
  }

  return reply({ at: new Date().toISOString(), graph: HAS_GRAPH, sources: out });
});
