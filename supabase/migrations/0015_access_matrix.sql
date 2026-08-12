-- Which plants each person can reach, in one answer.
--
-- `people_at(loc)` says who can reach *this* plant, which is the right question for the
-- screen it was written for and the wrong one for "make sure people cannot get into other
-- locations". That question is about a person, not a plant, and answering it a plant at a
-- time means nine round trips and nine chances to disagree.
--
-- Administrators only, and it says so in the function rather than in the page: a screen that
-- decides what to show is a courtesy, a function that refuses is the lock.
create or replace function public.access_matrix()
returns table(profile_id uuid, location_id text, can_edit boolean, pending_email text)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  select pl.profile_id, pl.location_id, pl.can_edit, null::text
    from public.profile_locations pl
   where private.is_admin()
  union all
  -- Somebody invited but never signed in has no profile yet; the grant is waiting in
  -- `pending_access` and the signup trigger applies it. They still have to appear on the
  -- screen, or an administrator cannot see what they have already given away.
  select null::uuid, pa.location_id, pa.can_edit, pa.email
    from public.pending_access pa
   where private.is_admin();
$$;

revoke all on function public.access_matrix() from public;
grant execute on function public.access_matrix() to authenticated;

-- Every plant, for the screen that assigns them. `locations` is readable by any signed-in
-- account already; this exists so the People screen does not have to depend on the
-- administrator's own grants to list the plants they are granting.
create or replace function public.all_locations()
returns table(id text, name text, sort_order int)
language sql
security definer
set search_path to 'public'
as $$
  select l.id, l.name, l.sort_order from public.locations l
   where private.is_admin() order by l.sort_order, l.name;
$$;

revoke all on function public.all_locations() from public;
grant execute on function public.all_locations() to authenticated;
