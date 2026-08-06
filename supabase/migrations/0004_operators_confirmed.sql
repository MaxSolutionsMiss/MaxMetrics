-- The plant manager's answer on the six operators whose last shift was months back.
-- Applied to maxmetrics-development on 2026-08-06.
--
-- `active` was seeded from twelve months of shifts, which is a guess dressed as a fact:
-- the sheet knows when someone last ran a machine, not whether they still work here. Two
-- of the six are still staff for reasons no timesheet could show — one is on leave, one
-- is a manager whose login other people use — and four have left.
--
-- Nothing about their history changes. `shifts` and `last_seen` stay exactly as they are,
-- and every daily row they appear in is untouched, so a productivity comparison across
-- 2025 still has all of 2025 in it. `active` governs one thing only: whether the name is
-- offered when somebody is entering today's numbers.

alter table public.operators add column if not exists note text not null default '';

comment on column public.operators.active is
  'Whether the name is offered for new entry. Never affects stored history.';
comment on column public.operators.confirmed is
  'A person who knows the plant has ruled on this row, rather than it being inferred from shift dates.';

update public.operators set active = false, confirmed = true, note = 'Left the plant.'
 where location_id = 'mississauga'
   and name in ('Amado Aquino', 'Kevin Hudson', 'Tehseen Khan', 'Edmund Agbeko');

update public.operators set active = true, confirmed = true,
       note = 'On leave, returning.'
 where location_id = 'mississauga' and name = 'Pawan Jeet';

update public.operators set active = true, confirmed = true,
       note = 'Manager. Her login is also used by others, so shifts under this name are not all hers.'
 where location_id = 'mississauga' and name = 'Clarissa Mendonca';
