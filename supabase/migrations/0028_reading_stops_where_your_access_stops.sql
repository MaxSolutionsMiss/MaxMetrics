-- Reading stops where your access stops.
--
-- Two tables have been readable in full by anybody with an account since access was first
-- written: `profiles` and `locations`. Both policies said `using (true)`, which is the
-- shape a policy takes when the question being answered was "is this person signed in?"
-- rather than "is this person's business here?". Nothing has gone wrong because of it.
-- The plant is one site and everybody in the building knows everybody else's name. But the
-- product now carries nine plants, and the reason to fix this is not the plant — it is that
-- an account which should only ever have seen Mississauga could list all nine, and any
-- account at all could read every row of `profiles` and learn precisely which four people
-- are administrators. That is a target list, handed over on request, to anybody who has
-- ever been given a password and not had it taken away again.
--
-- **`profiles`.** Your own row, and every row if you are an administrator. Nothing else in
-- the product needs more than that. The page reads exactly one profile — its own, at
-- `db.js` — and the two screens that show other people go through `people_at()` and
-- `access_matrix()`, which are `security definer` and answer on their own authority. The
-- coloured initials along the top of the dashboard are not a read of this table either:
-- every browser broadcasts its own name and colour over realtime presence, so what you see
-- there is what those people sent about themselves, not what the database told you about
-- them.
--
-- **`locations`.** The plants you have been granted, and every plant if you are an
-- administrator. `private.has_location()` already exists and already answers this question
-- for the rest of the schema; there was no reason for this one table to ask a different
-- one. The plant picker reads through `profile_locations`, whose own policy is already
-- `profile_id = auth.uid()`, so the embedded join keeps working and returns what it always
-- returned. The full list, for the screen that assigns access, keeps coming from
-- `all_locations()`.
--
-- Neither change alters what any current user can do. It changes what they could have
-- asked for and been given.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or private.is_admin());

drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations
  for select to authenticated
  using (private.has_location(id) or private.is_admin());

-- And the two functions the linter is right to point at, for the wrong reason.
--
-- `access_matrix()` and `all_locations()` are `security definer` and carry `execute` for
-- `anon`, which means a browser holding nothing but the publishable key can call them.
-- Both gate on `private.is_admin()` inside and hand an anonymous caller an empty set, so
-- nothing has ever leaked through either. But a `security definer` function that strangers
-- may call is a thing that has to be re-read carefully every time it is edited, and the
-- cheaper arrangement is that they cannot call it at all. Signed-in callers are unaffected:
-- `authenticated` keeps its grant, and the admin check inside is still what decides the
-- answer.
revoke execute on function public.access_matrix() from anon;
revoke execute on function public.all_locations() from anon;
