// Creating an account, which is the one thing a browser cannot do.
//
// Everything else about access is an ordinary table write behind row-level security, and
// `grant_access` handles it. Making a *person* is different: it writes to `auth.users`, and
// the only key that may do that is the service-role key, which must never reach a page. So
// this is a function, it runs on Supabase, and the key is injected into it rather than
// shipped anywhere.
//
// The flow the plant asked for, and nothing more than it:
//
//   An administrator types a name, an email and picks View only or Can edit.
//   MaxMetrics makes the account with a temporary password and hands it back on screen.
//   The administrator passes it on however they normally would.
//   The person signs in, is required to choose their own password, and is in.
//
// No email is sent. That is deliberate: this plant does not have outbound mail configured
// against this project, and a flow that silently depends on one is a flow that fails on a
// Monday morning with nobody able to say why. The password appears on the administrator's
// screen, once, and they hand it over the way they already hand over everything else.

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

// Readable, sayable over a desk, and long enough that it is not worth attacking during the
// ten minutes it exists for. No l, I, 1, O or 0 — every one of those has been misread off a
// sticky note by somebody who then said the software was broken.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const pick = (set: string, n: number) => set[bytes[n] % set.length];
  const word = (at: number) => [0, 1, 2, 3].map(i => pick(ALPHABET, at + i)).join('');
  return `${word(0)}-${word(4)}-${pick(DIGITS, 8)}${pick(DIGITS, 9)}${pick(DIGITS, 10)}`;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405);

  // Who is asking. The caller's own token is used to answer that, so this function cannot
  // be talked into believing something the database would not.
  const token = request.headers.get('Authorization') ?? '';
  if (!token) return reply({ error: 'Sign in first.' }, 401);
  const asCaller = createClient(URL_, ANON, { global: { headers: { Authorization: token } } });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return reply({ error: 'Sign in first.' }, 401);
  const { data: profile } = await asCaller
    .from('profiles').select('is_admin').eq('id', who.user.id).single();
  if (!profile?.is_admin) {
    return reply({ error: 'Only an administrator can add people.' }, 403);
  }

  let body: { email?: string; name?: string; location?: string; canEdit?: boolean };
  try { body = await request.json(); } catch { return reply({ error: 'Bad request.' }, 400); }
  const email = String(body.email ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim();
  const location = String(body.location ?? '').trim();
  if (!email || !email.includes('@')) return reply({ error: 'An email address is needed.' }, 400);
  if (!location) return reply({ error: 'A plant is needed.' }, 400);

  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const password = temporaryPassword();

  // `must_change_password` is the whole of the first-sign-in flow. It is metadata on the
  // account rather than a column, because the page has to see it before it has read
  // anything else — it is the reason it is not going to let them past.
  const { data: made, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name || email.split('@')[0], must_change_password: true },
  });

  let id = made?.user?.id;
  let reused = false;
  if (error) {
    // Already there. Reset the password rather than refusing: an administrator pressing
    // this button for somebody who already exists has told you what they want, which is for
    // that person to be able to get in.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find(u => (u.email ?? '').toLowerCase() === email);
    if (!found) return reply({ error: error.message }, 400);
    id = found.id;
    reused = true;
    const { error: reset } = await admin.auth.admin.updateUserById(found.id, {
      password,
      user_metadata: { ...found.user_metadata, must_change_password: true },
    });
    if (reset) return reply({ error: reset.message }, 400);
  }
  if (!id) return reply({ error: 'The account could not be created.' }, 400);

  if (name) await admin.from('profiles').update({ full_name: name }).eq('id', id);
  const { error: grant } = await admin.from('profile_locations')
    .upsert({ profile_id: id, location_id: location, can_edit: !!body.canEdit },
            { onConflict: 'profile_id,location_id' });
  if (grant) return reply({ error: grant.message }, 400);

  return reply({ email, password, reused });
});
