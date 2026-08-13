// Accounts: making them, changing them, and taking them away.
//
// Everything else about access is an ordinary table write behind row-level security, and
// `grant_access` handles it. Anything that touches `auth.users` is different: it needs the
// service-role key, which must never reach a page. So this is a function, it runs on
// Supabase, and the key is injected into it rather than shipped anywhere.
//
// Four actions, all administrators-only and all checked against the *caller's own token*
// rather than against anything the caller says about themselves:
//
//   create   make the account, set a temporary password, grant this plant
//   update   change the name, the username or the email address
//   reset    issue a new temporary password
//   remove   delete the account
//
// No email is sent by any of them. That is deliberate: this project has no outbound mail
// configured, and a sign-in flow that silently depends on one is a flow that fails on a
// Monday morning with nobody able to say why. A password appears on the administrator's
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

// Most of the plant has no work email, so an account can be a username instead.
//
// Supabase Auth signs people in by address, so a username is turned into one that can never
// receive mail: `.invalid` is reserved by RFC 2606 and is guaranteed never to resolve. The
// same rule is in `js/db.js`, because the sign-in page has to make the same translation
// before it calls Auth and it cannot reach this file. It is enforced here rather than
// trusted from there — a page can send anything, and what an account is keyed on is not
// something to take on a page's word.
const USERS_DOMAIN = 'users.maxmetrics.invalid';
const USERNAME_RULE = /^[a-z0-9][a-z0-9._-]{1,29}$/;

// An address is itself; a name becomes one; anything else is nothing.
function asLogin(identifier: unknown): string {
  const said = String(identifier ?? '').trim().toLowerCase();
  if (!said) return '';
  if (said.includes('@')) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(said) ? said : '';
  return USERNAME_RULE.test(said) ? `${said}@${USERS_DOMAIN}` : '';
}

// What a page should print. Never the synthetic address: nobody chose it, nobody can write
// to it, and showing it invites somebody to try.
const asIdentity = (address: string) =>
  address.toLowerCase().endsWith(`@${USERS_DOMAIN}`)
    ? address.slice(0, -(USERS_DOMAIN.length + 1)) : address;

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

  const token = request.headers.get('Authorization') ?? '';
  if (!token) return reply({ error: 'Sign in first.' }, 401);
  const asCaller = createClient(URL_, ANON, { global: { headers: { Authorization: token } } });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return reply({ error: 'Sign in first.' }, 401);
  const { data: profile } = await asCaller
    .from('profiles').select('is_admin').eq('id', who.user.id).single();
  if (!profile?.is_admin) {
    return reply({ error: 'Only an administrator can change accounts.' }, 403);
  }

  let body: {
    action?: string; id?: string; email?: string; name?: string;
    location?: string; canEdit?: boolean;
  };
  try { body = await request.json(); } catch { return reply({ error: 'Bad request.' }, 400); }
  const action = String(body.action ?? 'create');
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  // ── Change a name or an email ──
  if (action === 'update') {
    if (!body.id) return reply({ error: 'Which account?' }, 400);
    const email = asLogin(body.email);
    const name = String(body.name ?? '').trim();
    if (body.email && !email) {
      return reply({ error: 'That is neither an email address nor a workable username.' }, 400);
    }
    if (email) {
      const { error } = await admin.auth.admin.updateUserById(body.id, {
        email, email_confirm: true,
      });
      if (error) return reply({ error: error.message }, 400);
    }
    if (name) {
      const { error } = await admin.from('profiles')
        .update({
          full_name: name,
          initials: name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join(''),
        }).eq('id', body.id);
      if (error) return reply({ error: error.message }, 400);
    }
    return reply({ ok: true });
  }

  // ── A new temporary password for somebody who has lost theirs ──
  if (action === 'reset') {
    if (!body.id) return reply({ error: 'Which account?' }, 400);
    const { data: found } = await admin.auth.admin.getUserById(body.id);
    const password = temporaryPassword();
    const { error } = await admin.auth.admin.updateUserById(body.id, {
      password,
      user_metadata: { ...(found?.user?.user_metadata ?? {}), must_change_password: true },
    });
    if (error) return reply({ error: error.message }, 400);
    return reply({ email: asIdentity(found?.user?.email ?? ''), password, reused: true });
  }

  // ── Take an account away ──
  //
  // An administrator cannot delete themselves. It is not a permission question — it is that
  // a plant whose last administrator has removed their own account has no way back in
  // without somebody opening the database, and the button is one row away from every other
  // one on this screen.
  if (action === 'remove') {
    if (!body.id) return reply({ error: 'Which account?' }, 400);
    if (body.id === who.user.id) {
      return reply({ error: 'You cannot remove your own account.' }, 400);
    }
    const { error } = await admin.auth.admin.deleteUser(body.id);
    if (error) return reply({ error: error.message }, 400);
    return reply({ ok: true });
  }

  // ── Make the account ──
  const email = asLogin(body.email);
  const name = String(body.name ?? '').trim();
  const location = String(body.location ?? '').trim();
  if (!email) {
    return reply({ error: 'A username, or an email address, is needed. A username is two to '
      + 'thirty characters: lower-case letters, numbers, and . _ or -' }, 400);
  }
  if (!location) return reply({ error: 'A plant is needed.' }, 400);

  const password = temporaryPassword();
  // `must_change_password` is the whole of the first-sign-in flow. It is metadata on the
  // account rather than a column, because the page has to see it before it has read anything
  // else — it is the reason it is not going to let them past.
  const { data: made, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name || asIdentity(email).split('@')[0],
                     must_change_password: true },
  });

  let id = made?.user?.id;
  let reused = false;
  if (error) {
    // Already there. Reset the password rather than refusing: an administrator pressing this
    // button for somebody who already exists has told you what they want, which is for that
    // person to be able to get in.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find(u => (u.email ?? '').toLowerCase() === email);
    // Not "already there", then, and the one refusal worth naming is Auth turning down the
    // synthetic address itself. The administrator can do nothing with "Unable to validate
    // email address: invalid format" against a name they typed; they can do something with
    // being told to use an email address for this person while the domain is sorted out.
    if (!found) {
      return reply({ error: email.endsWith(`@${USERS_DOMAIN}`)
        ? `Sign-in would not accept the username "${asIdentity(email)}" (${error.message}). `
          + 'Give this person an email address for now and report it — the internal domain '
          + 'usernames are stored under needs changing.'
        : error.message }, 400);
    }
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

  return reply({ email: asIdentity(email), password, reused });
});
