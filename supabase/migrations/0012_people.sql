-- Who may see a plant, and who may change it.
--
-- The grants have existed since the first migration — `profile_locations` with a `can_edit`
-- flag, and `profiles.is_admin` — and there has never been a way to set any of them without
-- writing SQL. A plant that cannot add the person who covers Thursdays is a plant that
-- shares one login, which is how a dashboard stops being able to say who entered a number.
--
-- Three things are needed and none of them can be done from a browser today:
--
--   Reading who has access. `profiles` carries no email and `auth.users` is not reachable
--   from the client, so the list of people is an admin-only function rather than a table.
--
--   Adding somebody who has not signed up yet. Their account does not exist, so there is
--   nothing to grant access to — the grant has to wait for them and be applied when they
--   arrive.
--
--   Doing either without the service-role key, which must never reach a page.

-- ── Access that is waiting for an account ───────────────────────────────────────
create table if not exists public.pending_access (
  email       text not null,
  location_id text not null references public.locations(id) on delete cascade,
  can_edit    boolean not null default false,
  invited_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  primary key (email, location_id)
);
alter table public.pending_access enable row level security;
drop policy if exists pending_access_admin on public.pending_access;
create policy pending_access_admin on public.pending_access
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- ── A new account collects whatever was waiting for it ──────────────────────────
--
-- Replaces the trigger function from 0001, adding the second half: the profile is made as
-- before, and then any access an administrator set aside for that email is granted and the
-- pending row removed. So "add somebody" works the same whether or not they have signed up
-- yet, which is the only version of it an administrator can be expected to remember.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nm text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, full_name, initials)
  values (new.id, nm,
    upper(left(split_part(nm, ' ', 1), 1) ||
          coalesce(left(nullif(split_part(nm, ' ', 2), ''), 1), '')))
  on conflict (id) do nothing;

  insert into public.profile_locations (profile_id, location_id, can_edit)
  select new.id, p.location_id, p.can_edit
  from public.pending_access p
  where lower(p.email) = lower(new.email)
  on conflict (profile_id, location_id) do update set can_edit = excluded.can_edit;

  delete from public.pending_access where lower(email) = lower(new.email);
  return new;
end;
$$;
revoke all on function private.handle_new_user() from anon, authenticated, public;

-- ── Who has access to this plant ────────────────────────────────────────────────
--
-- Emails live in `auth.users`, which a page cannot read and should not be able to. This is
-- the one door: administrators only, one plant at a time, and it returns exactly the four
-- things the screen draws.
create or replace function public.people_at(loc text)
returns table (
  profile_id uuid, full_name text, email text, job_title text,
  is_admin boolean, can_edit boolean, has_access boolean, pending boolean)
language sql security definer set search_path = public, auth as $$
  select p.id, p.full_name, u.email, p.job_title, p.is_admin,
         coalesce(pl.can_edit, false), pl.profile_id is not null, false
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.profile_locations pl
      on pl.profile_id = p.id and pl.location_id = loc
   where private.is_admin()
  union all
  select null::uuid, pa.email, pa.email, 'Invited'::text, false,
         pa.can_edit, true, true
    from public.pending_access pa
   where pa.location_id = loc and private.is_admin()
  order by 8, 2;
$$;
revoke all on function public.people_at(text) from anon, public;
grant execute on function public.people_at(text) to authenticated;

-- ── Granting and removing ───────────────────────────────────────────────────────
--
-- One entry point for both halves of "add this person", so the screen does not have to know
-- whether the account exists. It returns what it did, in a word the page can put in front of
-- somebody: `granted` or `invited`.
create or replace function public.grant_access(person_email text, loc text, may_edit boolean)
returns text language plpgsql security definer set search_path = public, auth as $$
declare
  found uuid;
begin
  if not private.is_admin() then
    raise exception 'only an administrator can change who has access'
      using errcode = '42501';
  end if;
  if coalesce(trim(person_email), '') = '' then
    raise exception 'an email address is needed';
  end if;

  select u.id into found from auth.users u where lower(u.email) = lower(trim(person_email));

  if found is null then
    insert into public.pending_access (email, location_id, can_edit, invited_by)
    values (lower(trim(person_email)), loc, may_edit, auth.uid())
    on conflict (email, location_id) do update set can_edit = excluded.can_edit;
    return 'invited';
  end if;

  insert into public.profile_locations (profile_id, location_id, can_edit)
  values (found, loc, may_edit)
  on conflict (profile_id, location_id) do update set can_edit = excluded.can_edit;
  return 'granted';
end;
$$;
revoke all on function public.grant_access(text, text, boolean) from anon, public;
grant execute on function public.grant_access(text, text, boolean) to authenticated;

create or replace function public.revoke_access(person uuid, person_email text, loc text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then
    raise exception 'only an administrator can change who has access'
      using errcode = '42501';
  end if;
  if person is not null then
    delete from public.profile_locations
     where profile_id = person and location_id = loc;
  end if;
  if person_email is not null then
    delete from public.pending_access
     where lower(email) = lower(person_email) and location_id = loc;
  end if;
end;
$$;
revoke all on function public.revoke_access(uuid, text, text) from anon, public;
grant execute on function public.revoke_access(uuid, text, text) to authenticated;

-- ── Making somebody an administrator ────────────────────────────────────────────
--
-- An administrator may not remove their own flag. It is not a permission question, it is
-- that a plant with no administrator has no way back in without somebody opening the
-- database — and the mistake is one click away from the flag that grants it.
create or replace function public.set_admin(person uuid, make_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then
    raise exception 'only an administrator can change who is an administrator'
      using errcode = '42501';
  end if;
  if person = auth.uid() and not make_admin then
    raise exception 'you cannot remove your own administrator access';
  end if;
  update public.profiles set is_admin = make_admin where id = person;
end;
$$;
revoke all on function public.set_admin(uuid, boolean) from anon, public;
grant execute on function public.set_admin(uuid, boolean) to authenticated;
