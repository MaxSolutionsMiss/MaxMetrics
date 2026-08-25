-- A department names its own numbers, and a plant can add one.
-- Applied to metriq-development on 2026-08-07.
--
-- Toronto runs printing, die cutting and gluing. New Jersey windows and foil stamps, and
-- the other three plants each run something the first one does not. Until now the shape of
-- a plant was three seeded rows and a migration — so the second plant to open Metriq
-- would have had to wait on this repository to see its own floor.
--
-- Two things were missing. The rows had to be creatable through the interface, which they
-- already were as far as the policies go — `departments_write` is `for all` to anyone who
-- can edit the plant — and nobody had built the screen. And the labels were not the
-- plant's: `unit` gave both the volume noun and, with `/hr` glued on, the rate, and the
-- hours field was always headed "Hours". Windowing counts panes and is crewed in machine
-- hours, and reading "sheets/hr" over it is the dashboard telling New Jersey it was built for
-- somebody else.
--
-- So: two label columns and an icon. All three default to empty, and every reader falls
-- back to exactly what it printed before, which is why this migration moves nothing for
-- Toronto.

alter table public.location_departments
  add column rate_label  text not null default '',
  add column hours_label text not null default '',
  add column icon        text not null default '';

comment on column public.location_departments.unit is
  'The volume noun — sheets, cartons, panes. Also the label on the volume field.';
comment on column public.location_departments.rate_label is
  'What the per-hour figure is called. Empty means unit || ''/hr''.';
comment on column public.location_departments.hours_label is
  'What the hours field is called — crew hours, machine hours. Empty means ''Hours''.';
comment on column public.location_departments.icon is
  'The pictogram on the card. Empty falls back to the key-based map in readings.js.';

-- The three that exist keep the pictograms they have been printed with since January,
-- written down now rather than inferred, so renaming a department cannot silently change
-- the icon the room looks for.
update public.location_departments set icon = '🖨️' where key = 'printing'   and icon = '';
update public.location_departments set icon = '✂️' where key = 'diecutting' and icon = '';
update public.location_departments set icon = '📦' where key = 'gluing'     and icon = '';
update public.location_departments set icon = '🚚' where key = 'shipping'   and icon = '';

-- A key is generated from the name by the screen, and a department's key ends up in
-- `daily_departments.dept_key`, `daily_review.dept_key` and `machines.dept_key`. Nothing
-- joins on it, so a bad one is not a broken row — but it is a permanent one, and a key
-- with a space or a colon in it would collide with the `dept:key:field` naming the
-- dashboard uses to route a save. Refused at the table rather than in the browser.
alter table public.location_departments
  add constraint location_departments_key_shape
  check (key ~ '^[a-z][a-z0-9-]{1,38}$');

-- Sort order decides the running order of the cards, which is the order the meeting walks
-- the floor. Two departments sharing a number is not an error, but a plant that adds four
-- at once should not have to think about it, so the screen offers the next free number and
-- this keeps the existing rows contiguous.
update public.location_departments d set sort_order = ranked.position
  from (select id, row_number() over (partition by location_id
                                      order by sort_order, name) as position
          from public.location_departments) ranked
 where ranked.id = d.id and d.sort_order is distinct from ranked.position;
