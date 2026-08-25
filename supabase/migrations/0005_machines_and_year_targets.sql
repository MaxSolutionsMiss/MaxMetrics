-- Every operator is still here, and targets belong to a year.
-- Applied to metriq-development on 2026-08-06.
--
-- Two corrections and one addition.
--
-- The corrections: 0004 read four quiet names as departures. They are not. The plant runs
-- Sunday night through Friday night, and a crew leader on a line that does not run every
-- shift can go months without appearing — the shift date says nothing about employment.
-- Everyone goes back on the list. Pawan is on a three-month leave and Clarissa is a
-- manager whose login other people use; both stay, as does everyone else.
--
-- The addition: targets were a single number per department, which cannot survive a new
-- year. They actually live per machine — the plant's own sheet is titled "Toronto 2026
-- Machine KPIs" — and a department target is the mean of its machines'. Modelling it that
-- way means 2027 is a new row rather than an overwrite, so last year's numbers keep being
-- judged against last year's target, and changing one machine moves its department the way
-- the spreadsheet already does.

-- ── Everyone is active ──────────────────────────────────────────────────────────

update public.operators
   set active = true, confirmed = true,
       note = case when note = 'Left the plant.' then '' else note end
 where location_id = 'toronto';

comment on column public.operators.active is
  'Whether the name is offered for new entry. A gap in shifts is not absence — the plant '
  'runs Sunday night to Friday night and a line does not crew every shift.';

-- ── Machines ────────────────────────────────────────────────────────────────────

-- `code` is the value the DOR's Machine column carries, so an imported row finds its
-- machine without a translation table. Die cutting once had a machine called Bobst and
-- gluing still does, which is why the key includes the department.
create table public.machines (
  id          uuid primary key default gen_random_uuid(),
  location_id text not null references public.locations(id) on delete cascade,
  dept_key    text not null,
  code        text not null,
  name        text not null,
  aliases     text[] not null default '{}',
  sort_order  int not null default 0,
  active      boolean not null default true,
  unique (location_id, dept_key, code)
);

create table public.machine_targets (
  id            uuid primary key default gen_random_uuid(),
  machine_id    uuid not null references public.machines(id) on delete cascade,
  year          int  not null,
  speed_target  numeric,
  mr_target     numeric,
  uptime_target numeric,
  unique (machine_id, year)
);

comment on column public.machine_targets.speed_target is
  'Net output per crewed hour — the DOR''s NNN Speed, not Run Speed.';

alter table public.machines        enable row level security;
alter table public.machine_targets enable row level security;

create policy machines_read on public.machines
  for select to authenticated using (private.has_location(location_id));
create policy machines_write on public.machines
  for all to authenticated
  using (private.can_edit_location(location_id))
  with check (private.can_edit_location(location_id));

create policy machine_targets_read on public.machine_targets
  for select to authenticated using (exists (
    select 1 from public.machines m
     where m.id = machine_id and private.has_location(m.location_id)));
create policy machine_targets_write on public.machine_targets
  for all to authenticated
  using (exists (select 1 from public.machines m
                  where m.id = machine_id and private.can_edit_location(m.location_id)))
  with check (exists (select 1 from public.machines m
                       where m.id = machine_id and private.can_edit_location(m.location_id)));

insert into public.machines (location_id, dept_key, code, name, aliases, sort_order) values
  ('toronto', 'printing',   '40',     '40" Press',       '{}',            1),
  ('toronto', 'printing',   '41',     '41" Press',       '{}',            2),
  ('toronto', 'diecutting', '2017',   'Die Cutter 2017', '{106-17}',      1),
  ('toronto', 'diecutting', '2018',   'Die Cutter 2018', '{106-18}',      2),
  ('toronto', 'gluing',     'Hdlbrg', 'Heidelberg',      '{Heidelberg}',  1),
  ('toronto', 'gluing',     'Bobst',  'Bobst',           '{}',            2),
  ('toronto', 'gluing',     'Omega',  'Omega',           '{}',            3);

-- Retired, but kept so historical rows still resolve to a machine rather than being
-- dropped on import.
insert into public.machines (location_id, dept_key, code, name, active, sort_order) values
  ('toronto', 'printing',   '29',   '29" Press',       false, 9),
  ('toronto', 'diecutting', 'TR',   'TR',              false, 9),
  ('toronto', 'diecutting', 'JRK',  'JRK',             false, 9),
  ('toronto', 'diecutting', 'Bobst','Bobst die cutter',false, 9);

-- 2026, read from `Dept KPIs` in Toronto_KPIs.xlsx.
insert into public.machine_targets (machine_id, year, speed_target, mr_target, uptime_target)
select m.id, 2026, t.speed, t.mr, t.uptime
  from public.machines m
  join (values
    ('printing','40',3300,1.25,0.88), ('printing','41',2800,0.95,0.85),
    ('diecutting','2017',1850,1.60,0.90), ('diecutting','2018',2200,1.50,0.92),
    ('gluing','Hdlbrg',14000,1.15,0.90), ('gluing','Bobst',8800,0.90,0.90),
    ('gluing','Omega',13000,1.30,0.92)
  ) as t(dept, code, speed, mr, uptime)
    on t.dept = m.dept_key and t.code = m.code
 where m.location_id = 'toronto';

-- ── A department's target for a year ────────────────────────────────────────────

-- The mean of its live machines, which is exactly how the plant's sheet computes the
-- Dept. Average column. security_invoker so the view is read under the caller's own
-- row-level security rather than the owner's.
create view public.department_targets with (security_invoker = on) as
  select m.location_id, m.dept_key, t.year,
         round(avg(t.speed_target), 2)  as target,
         round(avg(t.mr_target), 3)     as mr_target,
         round(avg(t.uptime_target), 4) as uptime_target,
         count(*)                       as machines
    from public.machines m
    join public.machine_targets t on t.machine_id = m.id
   where m.active
   group by m.location_id, m.dept_key, t.year;

-- Bring the department defaults in line with the machines they are now derived from,
-- so nothing depends on which of the two was edited last.
update public.location_departments d
   set target        = t.target,
       mr_target     = t.mr_target,
       uptime_target = t.uptime_target
  from public.department_targets t
 where t.location_id = d.location_id and t.dept_key = d.key and t.year = 2026;
