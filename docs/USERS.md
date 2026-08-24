# Accounts

Metriq and MaxDock are **separate Supabase projects** — `maxmetrics-development`
(`mlmurglqeqilqutxzawq`) and `maxdock-development` (`rywzqepzramurbrpmept`). Separate
projects mean separate `auth.users` tables, so an account on one is not an account on the
other and nothing is shared automatically.

## What "the same password" can and cannot mean

Passwords are not stored. `auth.users.encrypted_password` holds a bcrypt hash, which is
one-way: nobody — not an administrator, not this repository, not Supabase support — can
read back what somebody types.

What *can* be done is copy the hash. Bcrypt verifies the same way in either project, so a
person carried across with their hash intact signs in to Metriq with the password they
already use for MaxDock, and never has to be told anything. That is the migration below.

The alternative is to create the account without a password and let Supabase send a
set-password link. Choose that when somebody should *not* keep using an old password —
a shared or demo login, or anyone whose access is being narrowed rather than copied.

## Two things to decide before running it

**Addresses that cannot receive mail.** Four of MaxDock's eight accounts are
`@maxdock.internal`, which is not a real mail domain. They work for signing in, but a
password reset or an invitation can never reach them. Two of those four (`maxdemo`,
`democo`) are demo logins. Carrying a demo login into a plant's real dashboard gives a
shared password access to live numbers, so name them explicitly if you want them — this
runbook will not assume it.

**Full autonomy is two separate grants.** `profiles.is_admin` controls administration;
`profile_locations` controls which plants a person sees, one row each, with `can_edit`.
Somebody who should change anything anywhere needs `is_admin = true` *and* a row for every
location. Setting only the first gives an administrator who cannot open a plant.

## Carrying people across

Run against **MaxDock** to read the accounts, listing exactly the addresses wanted:

```sql
select u.id, u.email, u.encrypted_password, u.raw_user_meta_data->>'full_name' as full_name
from auth.users u
where u.email in ('...', '...');
```

Then against **Metriq**, for each person. The user id is carried over deliberately: it
keeps a person the same row in both systems, which is what makes a later join between
MaxDock and Metriq answer questions about one person rather than two.

```sql
-- 1. The account. `confirmed` is set so the first sign-in is not blocked waiting on an
--    email that an @maxdock.internal address can never receive.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :id, 'authenticated', 'authenticated',
   :email, :encrypted_password, now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   jsonb_build_object('full_name', :full_name), now(), now())
on conflict (id) do nothing;

-- 2. The identity. Without it the email/password provider is not attached and the sign-in
--    fails even though the row above looks complete.
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values (:id, :id, jsonb_build_object('sub', :id::text, 'email', :email), 'email', now(), now())
on conflict (provider, provider_id) do nothing;

-- 3. Who they are in Metriq.
insert into public.profiles (id, full_name, initials, job_title, is_admin)
values (:id, :full_name, :initials, :job_title, :is_admin)
on conflict (id) do update set full_name = excluded.full_name, is_admin = excluded.is_admin;

-- 4. Which plants. Every location, editable — "full autonomy".
insert into public.profile_locations (profile_id, location_id, can_edit)
select :id, l.id, true from public.locations l
on conflict (profile_id, location_id) do update set can_edit = true;
```

## Checking it worked

```sql
select p.full_name, u.email, p.is_admin,
       count(pl.location_id) filter (where pl.can_edit) as plants_editable
from public.profiles p
join auth.users u on u.id = p.id
left join public.profile_locations pl on pl.profile_id = p.id
group by p.full_name, u.email, p.is_admin
order by p.is_admin desc, p.full_name;
```

Five plants are configured — Mississauga, Guelph, Pickering, Owen Sound and Markham — so
somebody with full autonomy should read `plants_editable = 5`.

## Taking access away

Deleting the `profile_locations` rows removes the plants and leaves the account able to
sign in to a page that tells them they are waiting on access, which is the gentler end of
a role change. Deleting from `auth.users` removes the account outright and cascades the
profile with it. Prefer the first while somebody is still at the company.
