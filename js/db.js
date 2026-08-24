// The one network module. Every request Metriq makes goes through here, so there is
// a single place that knows about retries, connection state and what a failure should
// say to the person reading it.
//
// The publishable key is meant to ship in the page. It grants nothing on its own: every
// table is behind row-level security, so what this key can read depends entirely on who
// is signed in. A plant's numbers are protected by the policies, not by the key.

const SUPABASE_URL = 'https://mlmurglqeqilqutxzawq.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__UJCApJlwFXRUTl1qGnuhQ_NOSFL6a0';

if (!globalThis.supabase?.createClient) {
  throw new Error('The Supabase client library did not load. Refresh the page and try again.');
}

export const client = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

let connectionState = 'online';
function emitConnection(state) {
  if (connectionState === state && state === 'online') return;
  connectionState = state;
  globalThis.dispatchEvent(new CustomEvent('metriq:connection', { detail: { state } }));
}
export const connection = () => connectionState;

// A morning meeting starts at a fixed time whether or not the network is well, so a
// request that can succeed on a second attempt takes one rather than surfacing an error
// somebody has to think about.
function describe(error, fallback) {
  const status = Number(error?.status || error?.statusCode || 0);
  const raw = String(error?.message || fallback || 'The request could not be completed.');
  const lower = raw.toLowerCase();
  const retryable = !status || status >= 500 || error?.code === 'PGRST000';
  let message = fallback || 'Metriq could not complete that request.';
  if (status === 401 || status === 403 || lower.includes('permission') || lower.includes('no edit access')) {
    message = 'Your account does not have permission to change this plant.';
  } else if (lower.includes('network') || lower.includes('fetch') || status >= 500) {
    message = 'The connection was interrupted. Metriq will keep trying.';
  } else if (raw.length < 180) {
    message = raw;
  }
  return { message, retryable, status, cause: error };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function run(operation, { retry = 1, fallback } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      emitConnection('online');
      return result?.data ?? null;
    } catch (cause) {
      const failure = describe(cause, fallback);
      if (failure.retryable && attempt < retry) {
        attempt += 1;
        emitConnection('retrying');
        await wait(400 * attempt);
        continue;
      }
      if (failure.retryable) emitConnection('offline');
      throw Object.assign(new Error(failure.message), failure);
    }
  }
}

// ── Who is signed in ────────────────────────────────────────────────────────────

// Most of the plant has no work email.
//
// Supabase Auth signs people in by email address, and a folding-carton floor is full of
// people who have never had one — a crew leader who reports the night is not going to be
// issued a mailbox so that a dashboard will let them in. So an account can be a username
// instead, and a username is turned into an address nobody can ever receive mail at.
//
// `.invalid` is reserved by RFC 2606 for exactly this: it is guaranteed never to resolve,
// so the address cannot be mistyped into somebody else's inbox, cannot be harvested, and
// cannot quietly start working one day because a domain got registered. It is a key, and it
// is shaped like an address only because the thing underneath demands that shape.
//
// The same rule is written a second time in `supabase/functions/people/index.ts`, because
// that runs in Deno and cannot reach this file. It is one constant and one `includes('@')`,
// and having the server enforce it rather than trust whatever a page sends is worth the
// eleven duplicated characters.
export const USERS_DOMAIN = 'users.maxmetrics.invalid';

// What to hand Supabase. An address is itself; a username becomes one.
export const asLogin = identifier => {
  const said = String(identifier ?? '').trim().toLowerCase();
  return !said || said.includes('@') ? said : `${said}@${USERS_DOMAIN}`;
};

// What to show a person. Nobody should ever be shown `jsmith@users.maxmetrics.invalid` —
// they did not choose it, they cannot write to it, and printing it on the People screen
// would have somebody trying to send it a password.
export const asIdentity = address => {
  const said = String(address ?? '').trim();
  return said.toLowerCase().endsWith(`@${USERS_DOMAIN}`)
    ? said.slice(0, -(USERS_DOMAIN.length + 1)) : said;
};

// Whether an account signs in by name rather than by address, which is the same question as
// "can this person be sent a reset link".
export const isUsername = address =>
  String(address ?? '').trim().toLowerCase().endsWith(`@${USERS_DOMAIN}`);

// A username has to survive being said across a room and typed by somebody else, so it is
// the small alphabet: lower case, digits, and the three separators that are on every
// keyboard. No spaces, because "the space is a dot" is a support call every time.
export const USERNAME_RULE = /^[a-z0-9][a-z0-9._-]{1,29}$/;

export const signIn = (identifier, password) =>
  run(() => client.auth.signInWithPassword({ email: asLogin(identifier), password }),
      { retry: 0, fallback: 'That username and password did not match an account.' });

export const signOut = () => client.auth.signOut();

export const resetPassword = email =>
  run(() => client.auth.resetPasswordForEmail(email, {
    redirectTo: new URL('index.html', location.href).href,
  }), { retry: 0 });

export const currentSession = async () => (await client.auth.getSession()).data.session;

export async function myProfile() {
  const session = await currentSession();
  if (!session) return null;
  const rows = await run(() => client.from('profiles').select('*').eq('id', session.user.id).limit(1));
  return rows?.[0] ?? null;
}

export const savePreference = (id, patch) =>
  run(() => client.from('profiles').update(patch).eq('id', id), { retry: 0 });

// Mine, and only mine. This used to lean on row-level security to do the filtering, which
// was true right up until a second account existed: an administrator's policy lets them
// read everybody's grants, so the list came back with each plant once per person and the
// location picker showed "Mississauga, Mississauga, Guelph, Guelph…". Whose rows these are
// is not a security question, it is part of the question being asked.
export const myLocations = async () => {
  const session = await currentSession();
  if (!session) return [];
  return run(() => client.from('profile_locations')
    .select('location_id, can_edit, locations(id, name, sort_order)')
    .eq('profile_id', session.user.id));
};

// ── A morning ───────────────────────────────────────────────────────────────────

// Opening a morning is three things, in order: make the rows, carry what carries, and age
// the bookings whose date has gone by. The third is why an item scheduled for last Thursday
// stops calling itself Scheduled — it is Overdue, and the card says so rather than leaving
// it on the upcoming list implying it is still to come.
export const openDay = async (location, date) => {
  await run(() => client.rpc('ensure_day', { loc: location, d: date }));
  await run(() => client.rpc('carry_forward', { loc: location, d: date }));
  await run(() => client.rpc('age_maintenance', { loc: location, d: date })).catch(() => {});
};

export function loadDay(location, date) {
  // Eight reads, issued together. They do not depend on each other, so waiting for them
  // in turn would only make the morning slower.
  const year = Number(date.slice(0, 4));
  return Promise.all([
    run(() => client.from('daily_metrics').select('*')
      .eq('location_id', location).eq('metric_date', date).limit(1)),
    run(() => client.from('daily_departments').select('*')
      .eq('location_id', location).eq('metric_date', date)),
    run(() => client.from('daily_review').select('*')
      .eq('location_id', location).eq('metric_date', date)),
    run(() => client.from('maintenance_items').select('*')
      .eq('location_id', location).eq('metric_date', date).order('sort_order')),
    run(() => client.from('daily_labour').select('*')
      .eq('location_id', location).eq('metric_date', date)),
    run(() => client.from('location_departments').select('*')
      .eq('location_id', location).eq('active', true).order('sort_order')),
    run(() => client.from('department_targets').select('*')
      .eq('location_id', location).eq('year', year)),
    run(() => client.from('locations').select('*').eq('id', location).limit(1)),
  ]).then(([metrics, departments, review, maintenance, labour, config, targets, plant]) => ({
    metrics: metrics?.[0] ?? null, departments, review, maintenance, labour,
    // The plant's own row: which optional cards it carries.
    plant: plant?.[0] ?? null,
    // A target belongs to a year. Reading the morning of 2 January 2027 has to compare
    // against 2027's number, and reopening a day in 2026 has to keep comparing against
    // 2026's — which only works if the year is part of the lookup rather than a column
    // somebody overwrites each January. Where a year has no machine targets set, the
    // department's own default stands, so a plant whose machines are not listed yet
    // behaves exactly as it did before.
    config: withTargets(config, targets),
  }));
}

const withTargets = (config, targets) => (config || []).map(dept => {
  const set = (targets || []).find(t => t.dept_key === dept.key);
  return set ? { ...dept, target: Number(set.target), mr_target: Number(set.mr_target),
                 uptime_target: Number(set.uptime_target), target_machines: set.machines }
             : dept;
});

// The names the Team column is matched against on import, with their known variants.
export const loadOperators = location =>
  run(() => client.from('operators').select('name, aliases, department, active')
    .eq('location_id', location).order('name'));

// Which mornings already exist. An import needs this to know what window it is filling:
// the span runs from the last morning to yesterday, so a long weekend or a shutdown falls
// out of the same rule instead of needing one of its own.
export const loadReportedDates = (location, fromDate, toDate) =>
  run(() => client.from('daily_metrics').select('metric_date')
    .eq('location_id', location).gte('metric_date', fromDate).lte('metric_date', toDate)
    .order('metric_date'))
    .then(rows => (rows || []).map(r => r.metric_date));

// One row per machine per year. A department's figure is the mean of its live machines,
// so 2027 is written by inserting rows rather than by editing 2026's.
export const loadMachines = location =>
  run(() => client.from('machines')
    .select('id, dept_key, code, name, active, sort_order, machine_targets(year, speed_target, mr_target, uptime_target)')
    .eq('location_id', location).order('dept_key').order('sort_order'));

export const saveMachineTarget = (machineId, year, patch) =>
  run(() => client.from('machine_targets')
    .upsert({ machine_id: machineId, year, ...patch }, { onConflict: 'machine_id,year' }),
    { retry: 0 });

// ── The plant's own shape ───────────────────────────────────────────────────────
//
// Configure Departments reads and writes these. It asks for inactive rows too — a
// department taken out of use is not deleted, because the mornings it appeared on are
// still in `daily_departments` and would lose their name.
// The plant row itself — its name, and the three switches for the optional quality cards.
export const loadPlant = location =>
  run(() => client.from('locations').select('*').eq('id', location).limit(1))
    .then(rows => rows?.[0] ?? null);

export const savePlant = (location, patch) =>
  run(() => client.from('locations').update(patch).eq('id', location), { retry: 0 });

export const loadDepartmentConfig = location =>
  run(() => client.from('location_departments').select('*')
    .eq('location_id', location).order('sort_order').order('name'));

export const saveDepartmentConfig = (id, patch) =>
  run(() => client.from('location_departments').update(patch).eq('id', id), { retry: 0 });

export const addDepartmentConfig = row =>
  run(() => client.from('location_departments').insert(row).select().limit(1), { retry: 0 })
    .then(rows => rows?.[0] ?? null);

// A department added mid-morning has no row on today's date. Asking for the day again is
// idempotent, so it costs nothing and means the new card can be typed into immediately
// rather than after tomorrow's open.
export const ensureDepartmentRows = (location, date) =>
  run(() => client.rpc('ensure_day', { loc: location, d: date }), { retry: 0 });

// The two weeks Monday's review is made of.
//
// Separate from `loadHistory` on purpose. That one is the seven days behind a card, and
// every trend line on the product is drawn from it — widening its window to reach back a
// fortnight would quietly turn every seven-point spark into a fourteen-point one. This is a
// different question over a different range, so it is a different read.
//
// `mr_count` comes along because a week's make-ready is the mean of its changeovers, not the
// mean of its days: a Tuesday with one changeover and a Wednesday with nine do not get an
// equal say in the number the meeting argues about.
export const loadWeeks = (location, fromDate, toDate) =>
  run(() => client.from('daily_departments')
    .select('metric_date, dept_key, qty, hours, uptime, make_ready, mr_count')
    .eq('location_id', location)
    .gte('metric_date', fromDate).lte('metric_date', toDate).order('metric_date'));

// Seven days behind today. The old file kept no history at all, so nothing in it could
// show a direction — a rate was a reading rather than a reading that is falling. Two
// reads, not one per day, because a week of mornings is a range query.
// Every reading drawn on a card now carries its own week behind it, so the read widened
// to match: uptime and make-ready per department, the streak dates the safety cards chase,
// and the counts shipping is judged on. It is still two queries over a seven-day range —
// the cost is columns, not round trips.
export function loadHistory(location, fromDate, toDate) {
  return Promise.all([
    run(() => client.from('daily_metrics')
      .select(`metric_date, otif, otd, coq, coq_ytd, shortages, late, shorts, cartons,
               jobs_shipped, mtd_otif, ytd_otif, injury_last, near_miss_last,
               fin_actual_mtd, fin_actual_ytd,
               ncr_today, complaints_internal_today, complaints_external_today`)
      .eq('location_id', location)
      .gte('metric_date', fromDate).lte('metric_date', toDate).order('metric_date')),
    run(() => client.from('daily_departments')
      .select('metric_date, dept_key, qty, hours, uptime, make_ready')
      .eq('location_id', location)
      .gte('metric_date', fromDate).lte('metric_date', toDate).order('metric_date')),
  ]).then(([metrics, departments]) => ({ metrics: metrics || [], departments: departments || [] }));
}

// The year, a month at a time.
//
// NCRs and complaints are closed off monthly, so the picture the room asks for is twelve
// columns rather than seven mornings. Every morning of the month carries the month-to-date
// count, so the month's total is the largest one written in it — which is why this reads
// the running column rather than a monthly table there is no reason to keep.
//
// Cost of quality rides along for the same reason and reads the same way: it is a monthly
// figure written on every morning after the month it covers has closed, and `coq_month` says
// which month that is. Grouped by that column it gives one point per closed month — the only
// honest line for a reading that does not move between months.
export const loadYearCounts = (location, year) =>
  run(() => client.from('daily_metrics')
    .select(`metric_date, ncr_mtd, complaints_internal_mtd, complaints_external_mtd,
             coq, coq_ytd, coq_month`)
    .eq('location_id', location)
    .gte('metric_date', `${year}-01-01`).lte('metric_date', `${year}-12-31`)
    .order('metric_date'));

export const loadBudgets = (location, year) =>
  run(() => client.from('location_budgets').select('month, amount')
    .eq('location_id', location).eq('year', year).order('month'));

// Only the field that changed is sent. Two people editing two readings of the same
// morning are two column updates, so neither carries the other's stale value back over
// the top of it. This is the whole reason the table is shaped in columns.
// A write that knows what it was looking at.
//
// One column per field is what stops two people editing two readings of the same morning
// from overwriting each other, and it has always done that job. What it does not do is stop
// two people editing *the same* reading: the coordinator corrects die cutting to 53,460, the
// manager corrects it to 53,640 from the sheet in their hand, and whoever's write lands
// second wins in silence. Both go on seeing their own number. At half past seven, with a
// meeting at quarter to, that is a coin toss nobody knows they took part in.
//
// So the update carries the value the page was looking at when the edit began and matches on
// it. Nothing changed since: one row updates and the write stands. Something changed: no row
// matches, and rather than guess, this reads back what is actually there and hands it to the
// caller to ask about.
//
// The check is per *field*, not per row, and that is the whole reason it can exist at all. A
// row-level version — an `updated_at` guard — would fire every time somebody edited a
// different column of the same morning, which on this product is most of the time, and a
// conflict prompt that is usually wrong is one people learn to click through.
//
// `seen` is left off by the importer and the pull, which are supposed to write over whatever
// is there.
export const saveField = (location, date, field, value, seen) =>
  run(async () => {
    let write = client.from('daily_metrics').update({ [field]: value })
      .eq('location_id', location).eq('metric_date', date);
    if (seen !== undefined) {
      write = seen === null || seen === '' ? write.is(field, null) : write.eq(field, seen);
    }
    const answer = await write.select(`metric_date, ${field}`);
    if (answer.error) throw answer.error;
    if (seen !== undefined && !answer.data?.length) {
      // Nothing matched. Either somebody else moved it, or the row is not there at all —
      // and the two are worth telling apart before anybody is asked a question.
      const now = await client.from('daily_metrics').select(field)
        .eq('location_id', location).eq('metric_date', date).limit(1);
      const theirs = now.data?.[0]?.[field] ?? null;
      if (!now.data?.length) throw new Error('That morning is not open.');
      // 409, so `run` does not class it as a connection problem and announce the app
      // offline over something that is nothing of the kind.
      throw Object.assign(new Error('Somebody else changed this while you were editing.'),
                          { status: 409, conflict: { field, theirs, mine: value } });
    }
    return answer;
  }, { retry: 0 });

// Upsert rather than update, for one reason: a department added in Configure at 07:10 has
// no row for a morning that was opened at 06:58, and an UPDATE matching nothing reports
// success while losing the number somebody just typed. The write is still one column —
// PostgREST sets only the columns in the payload — so nothing about who-overwrites-whom
// changes.
export const saveDepartment = (location, date, key, patch) =>
  run(() => client.from('daily_departments')
    .upsert({ location_id: location, metric_date: date, dept_key: key, ...patch },
            { onConflict: 'location_id,metric_date,dept_key' }), { retry: 0 });

// Same upsert as production and the review, and for the same reason: a department added
// this morning has no labour row on a day that was opened before it existed.
export const saveLabour = (location, date, key, patch) =>
  run(() => client.from('daily_labour')
    .upsert({ location_id: location, metric_date: date, dept_key: key, ...patch },
            { onConflict: 'location_id,metric_date,dept_key' }), { retry: 0 });

// What is coming, rather than what was scheduled for this morning.
//
// A maintenance row belongs to the plant, not to the day it was typed on: entered on Monday
// for Friday, it has to keep showing up until Friday. So this reads forward from the morning
// being viewed rather than matching its date. Rows with no date yet — somebody halfway
// through adding one — come last rather than disappearing.
export const loadUpcoming = (location, fromDate) =>
  run(() => client.from('maintenance_items')
    .select('*').eq('location_id', location)
    .or(`scheduled_on.gte.${fromDate},scheduled_on.is.null`)
    .order('scheduled_on', { ascending: true, nullsFirst: false })
    .order('sort_order').limit(24));

export const addMaintenance = (location, date) =>
  run(() => client.from('maintenance_items')
    .insert({ location_id: location, metric_date: date, scheduled_on: date })
    .select().limit(1), { retry: 0 }).then(rows => rows?.[0] ?? null);

export const saveMaintenance = (id, patch) =>
  run(() => client.from('maintenance_items').update(patch).eq('id', id), { retry: 0 });

export const removeMaintenance = id =>
  run(() => client.from('maintenance_items').delete().eq('id', id), { retry: 0 });

export const saveReview = (location, date, key, patch) =>
  run(() => client.from('daily_review')
    .upsert({ location_id: location, metric_date: date, dept_key: key, ...patch },
            { onConflict: 'location_id,metric_date,dept_key' }), { retry: 0 });

export const saveBudget = (location, year, month, amount) =>
  run(() => client.from('location_budgets')
    .upsert({ location_id: location, year, month, amount }), { retry: 0 });

// A morning that is not today.
//
// The old dashboard's JSON exports are the plant's history, and history is written to the
// date it happened on rather than to whatever day happens to be open. Two rules make that
// safe to run over a year of files:
//
//   The day is created if it is missing, so a date nobody has ever opened gets a row.
//   Nothing already entered is replaced. `coalesce(existing, incoming)` on every column
//   means an import can fill gaps and can never take a number a person typed.
//
// It is one call per morning rather than one per column, because a year of history is
// three hundred mornings and the no-lock argument is about people editing the same day at
// the same time — not about a bulk load of days nobody is looking at.
export async function importHistory(location, date, metrics, departments) {
  return run(() => client.rpc('import_morning', {
    loc: location, d: date,
    m: metrics || {},
    depts: departments || {},
  }), { retry: 0 });
}

// Publishing appends a revision rather than overwriting one.
//
// It used to be an update to a status column, so republishing silently replaced whatever the
// room had already read and there was no way to ask what a morning said when it went up.
// `publish_morning` sets the same status — every screen reads it and a second source of
// truth for one boolean would be worse than the problem — and beside it records who
// published, at which revision, whether the morning was incomplete, and why they published
// it anyway. It keeps a snapshot of the morning as it stood, which is what makes "a target
// change must not alter a published dashboard" true by construction.
export async function publish(location, date, { incomplete = false, note = null } = {}) {
  return run(() => client.rpc('publish_morning', {
    loc: location, d: date, incomplete, note,
  }), { retry: 0 });
}

// Every time this morning went up, and what was outstanding when it did.
export const loadPublications = (location, date) =>
  run(() => client.from('publications')
    .select('revision, published_at, incomplete, override_note')
    .eq('location_id', location).eq('metric_date', date)
    .order('revision', { ascending: false }));

// Attribution is recorded beside the value rather than inside it, so a number stays a
// number and the question "who entered this" still has an answer.
export async function recordEdit(location, date, field, value) {
  const session = await currentSession();
  if (!session) return;
  try {
    await client.from('field_edits').insert({
      location_id: location, metric_date: date, field,
      new_value: value == null ? null : String(value), edited_by: session.user.id,
    });
  } catch {
    // The trail is useful, not load-bearing. Losing one entry must never cost the
    // person the number they just typed.
  }
}

// ── Live ────────────────────────────────────────────────────────────────────────

// Two separate concerns share one channel. Presence answers "who else is here and what
// are they touching"; the row subscriptions answer "what changed". A screen showing the
// morning needs both, and the meeting-room TV needs only the second.
export function joinDay(location, date, { me, onPresence, onChange }) {
  const channel = client.channel(`day:${location}:${date}`, {
    config: { presence: { key: me.id } },
  });

  if (onPresence) {
    channel.on('presence', { event: 'sync' }, () => {
      const seen = new Map();
      for (const entries of Object.values(channel.presenceState())) {
        for (const entry of entries) if (entry?.id) seen.set(entry.id, entry);
      }
      onPresence([...seen.values()]);
    });
  }

  if (onChange) {
    for (const table of ['daily_metrics', 'daily_departments', 'daily_review',
                         'daily_labour', 'maintenance_items']) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: `location_id=eq.${location}` },
        payload => { if (payload.new?.metric_date === date) onChange(table, payload.new); });
    }
  }

  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') channel.track({ ...me, at: null });
  });

  return {
    // Announcing which field you are in is a write to the presence channel only. It
    // never touches the database, so moving around the page costs nothing.
    focus: at => channel.track({ ...me, at }),
    leave: () => client.removeChannel(channel),
  };
}

// ── Who has access ──────────────────────────────────────────────────────────────
//
// All four go through functions rather than tables, and for two different reasons.
//
// Reading the list needs the email, and emails live in `auth.users`, which a page cannot
// reach and should not be able to. Granting access needs to work for somebody who has not
// signed up yet — there is no account to grant anything to, so the grant waits in
// `pending_access` and the signup trigger collects it. Both are administrator-only, checked
// in the database rather than by hiding a button.
export const peopleAt = location =>
  run(() => client.rpc('people_at', { loc: location }));

export const grantAccess = (email, location, canEdit) =>
  run(() => client.rpc('grant_access', {
    person_email: email, loc: location, may_edit: canEdit,
  }), { retry: 0 });

export const revokeAccess = (profileId, email, location) =>
  run(() => client.rpc('revoke_access', {
    person: profileId ?? null, person_email: email ?? null, loc: location,
  }), { retry: 0 });

// Who can reach which plant, for everybody at once. Per-plant answers are what
// `people_at` gives; assigning access is a question about a person.
export const accessMatrix = () => run(() => client.rpc('access_matrix'));
export const allLocations = () => run(() => client.rpc('all_locations'));

export const setAdmin = (profileId, makeAdmin) =>
  run(() => client.rpc('set_admin', { person: profileId, make_admin: makeAdmin }), { retry: 0 });

// Making an account, which needs the service-role key and therefore cannot happen here.
//
// `people/index.ts` runs on Supabase, checks the caller's own token against `is_admin`, and
// hands back a temporary password for the administrator to pass on. Nothing is emailed:
// this project has no outbound mail configured, and a flow that silently depends on one is
// a flow that fails on a Monday with nobody able to say why.
async function callPeople(payload) {
  const session = await currentSession();
  if (!session) throw new Error('Sign in first.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/people`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'That could not be done.');
  return body;
}

export const createPerson = ({ email, name, location, canEdit }) =>
  callPeople({ action: 'create', email, name, location, canEdit });
export const updatePerson = ({ id, name, email }) =>
  callPeople({ action: 'update', id, name, email });
export const resetPersonPassword = id => callPeople({ action: 'reset', id });
export const removePerson = id => callPeople({ action: 'remove', id });

// The first sign-in. `must_change_password` is metadata rather than a column because the
// page has to see it before it has read anything else.
export const mustChangePassword = async () => {
  const session = await currentSession();
  return !!session?.user?.user_metadata?.must_change_password;
};

export const chooseOwnPassword = async password => {
  const { error } = await client.auth.updateUser({
    password, data: { must_change_password: false },
  });
  if (error) throw new Error(error.message);
};

// ── Pull ────────────────────────────────────────────────────────────────────────
//
// The server fetches the plant's linked files — SharePoint sends no CORS headers, so the
// browser cannot — parks them in a private bucket and hands back signed URLs. The page then
// reads them with the same parser it has always used. One button, no dialogue, and still
// exactly one parser in the product.
export const loadSources = location =>
  run(() => client.from('location_sources').select('*')
    .eq('location_id', location).order('sort_order'));

export const saveSource = (id, patch) =>
  run(() => client.from('location_sources').update(patch).eq('id', id), { retry: 0 });

export const addSource = (location, kind, name, sortOrder) =>
  run(() => client.from('location_sources')
    .insert({ location_id: location, kind, name, sort_order: sortOrder })
    .select().limit(1), { retry: 0 }).then(rows => rows?.[0] ?? null);

export const dropSource = id =>
  run(() => client.from('location_sources').delete().eq('id', id), { retry: 0 });

// Start this morning again. Everything that should begin blank does; the safety streak and
// the targets are carried rather than cleared, so it comes back looking like a morning
// nobody has touched rather than one with a hole in it.
export const resetMorning = (location, date) =>
  run(() => client.rpc('reset_morning', { loc: location, d: date }), { retry: 0 });

// Spelling and grammar on a comment, and nothing else.
//
// `tidy/index.ts` runs on Supabase because the key it needs must never reach a page. It
// answers one of three ways: the corrected text, an `error` the page shows and then leaves
// the person's own words alone, or `unavailable` — which means no key is configured for this
// plant and the button should stop offering something that cannot work.
// `tone` is empty for Clean up and one of the function's own names for a rewrite. The two
// are one call because they are one act from the writer's side — something happens to the
// box, you look at it, and you keep it or you put yours back — and one endpoint means one
// place holding the rate limit, the edit check and the key.
export async function tidyText(text, location, tone = '') {
  const session = await currentSession();
  if (!session) throw new Error('Sign in first.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/tidy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    // The plant is sent so the function can check that this account may write here, rather
    // than only that it is signed in. A read-only account has no business spending the
    // plant's model budget on a box it cannot save.
    body: JSON.stringify({ text, location, tone }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'That could not run.');
  return body;
}

// `only` is one source's id — the Test button beside a link, which asks the one question
// somebody pasting a link actually has: does this one work? A whole-plant pull to find out
// takes three fetches and answers about all of them.
export async function pullSources(location, date, only) {
  const session = await currentSession();
  if (!session) throw new Error('Sign in first.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/pull`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ location, date, only }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Nothing could be fetched.');
  return body;
}

// ── KPI, on demand ──────────────────────────────────────────────────────────────
//
// One read per question. The picker already knows which table a measure lives in, so
// this takes the table rather than guessing at it. Row-level security decides which
// plants come back: somebody granted one plant asks the same question as somebody
// granted nine and gets one plant, without the page having to know the difference.

export const kpiRows = (table, locations, from, to) =>
  run(() => client.from(table).select('*')
    .in('location_id', locations)
    .gte('metric_date', from).lte('metric_date', to)
    .order('metric_date'));

// So an answer can say "Die Cutting" rather than "diecutting". `unit` comes along because
// departments do not all count the same thing — Printing counts sheets and Gluing counts
// cartons — and an answer that adds those together is arithmetic, not a figure.
export const kpiDepartments = locations =>
  run(() => client.from('location_departments')
    .select('location_id, key, name, unit, sort_order, active')
    .in('location_id', locations).order('sort_order'));

// ── Data Bank ───────────────────────────────────────────────────────────────────

export const dataSources = locations =>
  run(() => client.from('location_sources')
    .select('id, location_id, kind, name, url, enabled, last_pulled_at, last_status, last_note, sort_order')
    .in('location_id', locations).order('sort_order'));

// What each table actually holds for the plants this person can see, and how fresh it
// is. Only the date column is read — enough to count rows and find the newest morning
// without dragging the whole table across the wire.
export const bankCounts = locations => Promise.all(
  ['daily_metrics', 'daily_departments', 'daily_review', 'daily_labour'].map(table =>
    run(() => client.from(table).select('metric_date')
      .in('location_id', locations).order('metric_date', { ascending: false }))
      .then(rows => ({
        table,
        rows: (rows || []).length,
        newest: rows?.[0]?.metric_date ?? null,
      }))));
