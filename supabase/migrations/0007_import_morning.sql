-- Writing a morning that is not today.
-- Applied to maxmetrics-development on 2026-08-07.
--
-- The plant has been running `Daily_Morning_Dashboard_Vr 22.html` since January and it can
-- write a day out as JSON. Those files are the only record of the mornings before
-- Metriq existed, and there is no reason they should stop being readable — so the
-- importer takes them, and this is where they land.
--
-- Two rules, both of which exist so a year of files can be dropped in without anyone
-- having to think about the order:
--
--   The day is created if it is missing. A date nobody has opened has no row, and a
--   history import must not require somebody to visit three hundred mornings first.
--
--   Nothing already entered is replaced. Every column is `coalesce(existing, incoming)`,
--   so an import fills gaps and can never take a number a person typed. Running the same
--   file twice therefore changes nothing the second time, which is what makes it safe to
--   run again when it half-worked the first time.
--
-- One call per morning rather than one per column. The one-column-per-write rule exists so
-- three people editing the same morning do not overwrite each other; a bulk load of days
-- nobody is looking at is not that situation, and three hundred mornings at twenty columns
-- each would be six thousand round trips.

create function public.import_morning(loc text, d date, m jsonb, depts jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  key text;
  body jsonb;
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;

  insert into public.daily_metrics (location_id, metric_date)
  values (loc, d) on conflict (location_id, metric_date) do nothing;

  update public.daily_metrics t set
    injury_last      = coalesce(t.injury_last,      (m->>'injury_last')::date),
    injury_record    = coalesce(t.injury_record,    (m->>'injury_record')::int),
    near_miss_last   = coalesce(t.near_miss_last,   (m->>'near_miss_last')::date),
    near_miss_record = coalesce(t.near_miss_record, (m->>'near_miss_record')::int),
    shortages        = coalesce(t.shortages,        (m->>'shortages')::int),
    coq              = coalesce(t.coq,              (m->>'coq')::numeric),
    coq_target       = coalesce(t.coq_target,       (m->>'coq_target')::numeric),
    coq_ytd          = coalesce(t.coq_ytd,          (m->>'coq_ytd')::numeric),
    coq_ytd_target   = coalesce(t.coq_ytd_target,   (m->>'coq_ytd_target')::numeric),
    jobs_shipped     = coalesce(t.jobs_shipped,     (m->>'jobs_shipped')::int),
    jobs_on_time     = coalesce(t.jobs_on_time,     (m->>'jobs_on_time')::int),
    cartons          = coalesce(t.cartons,          (m->>'cartons')::int),
    late             = coalesce(t.late,             (m->>'late')::int),
    shorts           = coalesce(t.shorts,           (m->>'shorts')::int),
    otd              = coalesce(t.otd,              (m->>'otd')::numeric),
    otif             = coalesce(t.otif,             (m->>'otif')::numeric),
    mtd_otif         = coalesce(t.mtd_otif,         (m->>'mtd_otif')::numeric),
    ytd_otif         = coalesce(t.ytd_otif,         (m->>'ytd_otif')::numeric),
    maintenance_note = coalesce(nullif(t.maintenance_note, ''), m->>'maintenance_note'),
    staffing_note    = coalesce(nullif(t.staffing_note, ''),    m->>'staffing_note')
  where t.location_id = loc and t.metric_date = d;

  -- A department in the file that this plant does not run is skipped rather than invented.
  -- The old dashboard was Mississauga's, so its three keys are the ones that appear; a key
  -- with no `location_departments` row behind it would produce a card with no name.
  for key, body in select * from jsonb_each(coalesce(depts, '{}'::jsonb)) loop
    if exists (select 1 from public.location_departments ld
                where ld.location_id = loc and ld.key = key) then
      insert into public.daily_departments (location_id, metric_date, dept_key)
      values (loc, d, key) on conflict (location_id, metric_date, dept_key) do nothing;
      update public.daily_departments t set
        qty        = coalesce(t.qty,        (body->>'qty')::numeric),
        hours      = coalesce(t.hours,      (body->>'hours')::numeric),
        target     = coalesce(t.target,     (body->>'target')::numeric),
        pw_qty     = coalesce(t.pw_qty,     (body->>'pw_qty')::numeric),
        pw_hours   = coalesce(t.pw_hours,   (body->>'pw_hours')::numeric),
        uptime     = coalesce(t.uptime,     (body->>'uptime')::numeric),
        make_ready = coalesce(t.make_ready, (body->>'make_ready')::numeric)
      where t.location_id = loc and t.metric_date = d and t.dept_key = key;
    end if;
  end loop;
end;
$$;

revoke all on function public.import_morning(text, date, jsonb, jsonb) from anon, public;
grant execute on function public.import_morning(text, date, jsonb, jsonb) to authenticated;
