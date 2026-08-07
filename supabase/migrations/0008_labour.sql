-- Overtime is not maintenance.
-- Applied to maxmetrics-development on 2026-08-07.
--
-- "Maintenance & Staffing" was one section because both were a note, and a note is cheap to
-- put anywhere. They are not one subject. Maintenance is a schedule with a status — it is
-- either done, due or overdue, and the room needs to know which. Overtime is a cost the
-- plant is choosing to spend this morning, and the question the meeting actually asks about
-- it is "which departments, and how many shifts".
--
-- That question has no source. `Overtime` in Mississauga_KPIs is per pay period with no
-- department and no shift breakdown — it answers how much was spent two weeks ago, not
-- what is running today. So this is typed, one row per department per morning, next to the
-- volume and hours that department is already entering.
--
-- Shifts rather than hours, because that is the unit the floor talks in and the one a
-- supervisor can answer without a timesheet. Hours are recoverable from the pay period; the
-- shift count is what nobody writes down.

create table public.daily_labour (
  location_id text not null references public.locations(id) on delete cascade,
  metric_date date not null,
  dept_key    text not null,
  ot_shifts   numeric,          -- half shifts happen, so not an integer
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (location_id, metric_date, dept_key)
);

alter table public.daily_labour enable row level security;

create policy labour_day_read on public.daily_labour
  for select to authenticated using (private.has_location(location_id));
create policy labour_day_write on public.daily_labour
  for all to authenticated using (private.can_edit_location(location_id))
  with check (private.can_edit_location(location_id));

create trigger daily_labour_touch before update on public.daily_labour
  for each row execute function private.touch_updated_at();

alter publication supabase_realtime add table public.daily_labour;

-- A new morning arrives with a row per department, empty, the same way production and the
-- 24-hour review do. Nought overtime is an answer and has to be enterable as one.
create or replace function public.ensure_day(loc text, d date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;
  insert into public.daily_metrics (location_id, metric_date)
  values (loc, d) on conflict (location_id, metric_date) do nothing;
  insert into public.daily_departments (location_id, metric_date, dept_key, target)
  select ld.location_id, d, ld.key, ld.target from public.location_departments ld
  where ld.location_id = loc and ld.active and ld.on_metrics
  on conflict (location_id, metric_date, dept_key) do nothing;
  insert into public.daily_review (location_id, metric_date, dept_key)
  select ld.location_id, d, ld.key from public.location_departments ld
  where ld.location_id = loc and ld.active and ld.on_review
  on conflict (location_id, metric_date, dept_key) do nothing;
  insert into public.daily_labour (location_id, metric_date, dept_key)
  select ld.location_id, d, ld.key from public.location_departments ld
  where ld.location_id = loc and ld.active
  on conflict (location_id, metric_date, dept_key) do nothing;
end;
$$;
