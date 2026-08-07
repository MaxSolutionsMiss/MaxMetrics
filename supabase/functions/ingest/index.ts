// The endpoint a morning arrives at.
//
// Everything that is not a person typing goes through here: a Power Automate flow when a
// file lands in SharePoint, a scheduled job pulling from Graph, a script on a plant PC, or
// somebody with curl. The transport is deliberately not this function's business — its
// business is that a file becomes a morning.
//
// It imports `js/import.js` and `js/xlsx.js` **unchanged**, the same two modules the
// browser importer uses. That is the whole point. A second parser written for the server
// would drift from the one the preview screen shows, and then the number the room accepted
// on Tuesday and the number the flow wrote on Wednesday would come from different code.
// Both modules use web-standard APIs only — TextDecoder, Blob, DecompressionStream,
// Response — which Deno has, so there is nothing to port.
//
// Writes go through `import_morning`, so the two rules that make a bulk load safe hold
// here as well: the day is created if it is missing, and a reading somebody typed is never
// replaced. A flow that fires twice writes the same morning twice and changes nothing the
// second time.

import { readFiles } from '../_shared/import.js';
import { createClient } from 'npm:@supabase/supabase-js@2.52.1';

const SECRET = Deno.env.get('MAXMETRICS_INGEST_KEY') ?? '';
const URL_ = Deno.env.get('SUPABASE_URL')!;
// The service-role key never leaves the server. It is injected by Supabase and is the
// reason this runs here rather than in the page: an import writes to dates nobody has
// open, which no signed-in session should be able to do on its own.
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// `import.js` is plain JavaScript, so TypeScript reads its `= []` defaults as `never[]`
// and refuses every real argument. Naming the shape here is the whole of the typing this
// file needs, and it earns its place twice over: these are precisely the fields that would
// go quietly missing if the parser's output ever changed under it.
type Morning = {
  span: { from: string; to: string };
  departments: { dept_key: string; qty: number; hours: number }[];
  shipping: { jobs_shipped: number; jobs_on_time: number; late: number; shorts: number } | null;
  json: {
    days: { date: string; metrics: Record<string, unknown>; departments: Record<string, unknown> }[];
    unknown: string[];
  } | null;
  unknownNames: { name: string }[];
  shiftCount: number;
  notes: string[];
};
const readMorning = readFiles as unknown as (
  files: File[],
  options: { date: string; reported: string[]; operators: unknown[] },
) => Promise<Morning>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status, headers: { 'content-type': 'application/json' },
  });

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
  // The morning a workbook is read *for*. A JSON export ignores this and uses its own
  // dates; a DOR needs to know which morning it is filling.
  const date = request.headers.get('x-maxmetrics-date') ?? new Date().toISOString().slice(0, 10);
  if (!location) return json({ error: 'x-maxmetrics-location is required.' }, 400);

  const client = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  let read: Morning;
  try {
    const file = new File([await request.arrayBuffer()], name);
    // The window and the operator list are read the same way the page reads them, so an
    // automated import fills exactly the span a person's import would have filled.
    const [{ data: operators }, { data: reported }] = await Promise.all([
      client.from('operators').select('name, aliases, department, active').eq('location_id', location),
      client.from('daily_metrics').select('metric_date').eq('location_id', location)
        .lt('metric_date', date).order('metric_date', { ascending: false }).limit(30),
    ]);
    read = await readMorning([file], {
      date,
      reported: (reported ?? []).map(r => r.metric_date),
      operators: operators ?? [],
    });
  } catch (cause) {
    return json({ error: `Could not read ${name}: ${(cause as Error).message}` }, 422);
  }

  const wrote: string[] = [];
  const failed: { date: string; error: string }[] = [];

  // A workbook fills the morning it was read for.
  if (read.departments.length || read.shipping) {
    const metrics: Record<string, unknown> = read.shipping
      ? { jobs_shipped: read.shipping.jobs_shipped, jobs_on_time: read.shipping.jobs_on_time,
          late: read.shipping.late, shorts: read.shipping.shorts }
      : {};
    const departments: Record<string, unknown> = {};
    for (const d of read.departments) departments[d.dept_key] = { qty: d.qty, hours: d.hours };
    const { error } = await client.rpc('import_morning',
      { loc: location, d: read.span.to, m: metrics, depts: departments });
    error ? failed.push({ date: read.span.to, error: error.message }) : wrote.push(read.span.to);
  }

  // A JSON export fills the dates written on its own records.
  for (const day of read.json?.days ?? []) {
    const { error } = await client.rpc('import_morning',
      { loc: location, d: day.date, m: day.metrics, depts: day.departments });
    error ? failed.push({ date: day.date, error: error.message }) : wrote.push(day.date);
  }

  // A file that was read but yielded nothing is a failure, not a quiet success. This is
  // what a renamed tab looks like, and the whole point of the system is that a number does
  // not silently stop updating — so it answers 4xx, the watcher logs it red, and it does
  // not mark the file done, which means it complains again tomorrow until somebody fixes
  // it.
  const status = failed.length ? 207 : wrote.length ? 200 : 422;

  return json({
    file: name, location,
    covering: { from: read.span.from, to: read.span.to },
    shifts: read.shiftCount ?? 0,
    departments: read.departments.map(d => d.dept_key),
    wrote, failed,
    // Named, not swallowed. A file that half-works has to say which half, or the next
    // person to look at it is diffing two screens.
    unrecognised: read.json?.unknown ?? [],
    unknownOperators: (read.unknownNames ?? []).map(n => n.name),
    notes: read.notes ?? [],
  }, status);
});
