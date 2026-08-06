// The one network module. Every request MaxMetrics makes goes through here, so there is
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
  globalThis.dispatchEvent(new CustomEvent('maxmetrics:connection', { detail: { state } }));
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
  let message = fallback || 'MaxMetrics could not complete that request.';
  if (status === 401 || status === 403 || lower.includes('permission') || lower.includes('no edit access')) {
    message = 'Your account does not have permission to change this plant.';
  } else if (lower.includes('network') || lower.includes('fetch') || status >= 500) {
    message = 'The connection was interrupted. MaxMetrics will keep trying.';
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

export const signIn = (email, password) =>
  run(() => client.auth.signInWithPassword({ email, password }),
      { retry: 0, fallback: 'That email and password did not match an account.' });

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

export const myLocations = () =>
  run(() => client.from('profile_locations')
    .select('location_id, can_edit, locations(id, name, sort_order)'));

// ── A morning ───────────────────────────────────────────────────────────────────

export const openDay = async (location, date) => {
  await run(() => client.rpc('ensure_day', { loc: location, d: date }));
  await run(() => client.rpc('carry_forward', { loc: location, d: date }));
};

export function loadDay(location, date) {
  // Six reads, issued together. They do not depend on each other, so waiting for them
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
    run(() => client.from('location_departments').select('*')
      .eq('location_id', location).eq('active', true).order('sort_order')),
    run(() => client.from('department_targets').select('*')
      .eq('location_id', location).eq('year', year)),
  ]).then(([metrics, departments, review, maintenance, config, targets]) => ({
    metrics: metrics?.[0] ?? null, departments, review, maintenance,
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

// Seven days behind today. The old file kept no history at all, so nothing in it could
// show a direction — a rate was a reading rather than a reading that is falling. Two
// reads, not one per day, because a week of mornings is a range query.
export function loadHistory(location, fromDate, toDate) {
  return Promise.all([
    run(() => client.from('daily_metrics')
      .select('metric_date, otif, otd, coq, shortages, late, jobs_shipped')
      .eq('location_id', location)
      .gte('metric_date', fromDate).lte('metric_date', toDate).order('metric_date')),
    run(() => client.from('daily_departments')
      .select('metric_date, dept_key, qty, hours')
      .eq('location_id', location)
      .gte('metric_date', fromDate).lte('metric_date', toDate).order('metric_date')),
  ]).then(([metrics, departments]) => ({ metrics: metrics || [], departments: departments || [] }));
}

export const loadBudgets = (location, year) =>
  run(() => client.from('location_budgets').select('month, amount')
    .eq('location_id', location).eq('year', year).order('month'));

// Only the field that changed is sent. Two people editing two readings of the same
// morning are two column updates, so neither carries the other's stale value back over
// the top of it. This is the whole reason the table is shaped in columns.
export const saveField = (location, date, field, value) =>
  run(() => client.from('daily_metrics').update({ [field]: value })
    .eq('location_id', location).eq('metric_date', date), { retry: 0 });

export const saveDepartment = (location, date, key, patch) =>
  run(() => client.from('daily_departments').update(patch)
    .eq('location_id', location).eq('metric_date', date).eq('dept_key', key), { retry: 0 });

export const saveReview = (location, date, key, patch) =>
  run(() => client.from('daily_review').update(patch)
    .eq('location_id', location).eq('metric_date', date).eq('dept_key', key), { retry: 0 });

export const saveBudget = (location, year, month, amount) =>
  run(() => client.from('location_budgets')
    .upsert({ location_id: location, year, month, amount }), { retry: 0 });

export async function publish(location, date) {
  const session = await currentSession();
  return run(() => client.from('daily_metrics').update({
    status: 'published', published_at: new Date().toISOString(), published_by: session?.user?.id ?? null,
  }).eq('location_id', location).eq('metric_date', date), { retry: 0 });
}

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
    for (const table of ['daily_metrics', 'daily_departments', 'daily_review', 'maintenance_items']) {
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
