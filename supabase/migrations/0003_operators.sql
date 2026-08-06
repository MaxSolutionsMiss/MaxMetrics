-- The crew leaders the plant actually has, one row per person, one spelling each.
-- Applied to maxmetrics-development on 2026-08-06.
--
-- Built from the DOR's own Data tabs: every name entered against a shift since August
-- 2025, with variants collapsed. The workbook types this column freely, so one person
-- becomes several — Anton appeared three ways and Francisco two — and any pivot filtered
-- by team reported each spelling as a different operator. The importer matches incoming
-- names against `aliases` and writes the canonical one, so the split stops at the door
-- even though the workbook still allows it.
--
-- `active` is set from twelve months of shifts. It is a starting position, not a fact
-- about employment, and is meant to be corrected by someone who knows.

create table public.operators (
  id          uuid primary key default gen_random_uuid(),
  location_id text not null references public.locations(id) on delete cascade,
  name        text not null,
  department  text not null default '',
  aliases     text[] not null default '{}',
  last_seen   date,
  shifts      int not null default 0,
  active      boolean not null default true,
  confirmed   boolean not null default false,
  unique (location_id, name)
);

alter table public.operators enable row level security;
create policy operators_read on public.operators
  for select to authenticated using (private.has_location(location_id));
create policy operators_write on public.operators
  for all to authenticated
  using (private.can_edit_location(location_id))
  with check (private.can_edit_location(location_id));

-- Seed: 24 operators active in the twelve months to August 2026. See the repository
-- history for how the variants were clustered.
