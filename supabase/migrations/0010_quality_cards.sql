-- Which quality cards a plant shows.
-- Applied to maxmetrics-development on 2026-08-07.
--
-- NCRs, internal complaints and customer complaints are the readings a quality manager is
-- asked for — at the plants that raise them. Not every plant does, and a card that reads a
-- permanent dash is worse than no card: it teaches the room that a blank is normal, which
-- is exactly what a dashboard must not teach.
--
-- Booleans on `locations` rather than a settings table, because these are three fixed
-- questions about a plant and not an open-ended bag of preferences. When there is a fourth
-- and a fifth this becomes a table; three is not a table yet.

alter table public.locations
  add column show_ncr      boolean not null default true,
  add column show_internal boolean not null default true,
  add column show_external boolean not null default true;

comment on column public.locations.show_ncr is
  'Whether the Quality section carries the NCRs-received card.';

-- `locations_read` is already `using (true)` — the plant list is not a secret and the
-- numbers behind it are governed separately — so reading these three needs nothing new.
-- Writing them does: it is a plant-configuration change, and `locations_admin` restricted
-- that to administrators. A plant manager who may edit a plant may say which cards it
-- carries.
create policy locations_write on public.locations
  for update to authenticated
  using (private.can_edit_location(id))
  with check (private.can_edit_location(id));
