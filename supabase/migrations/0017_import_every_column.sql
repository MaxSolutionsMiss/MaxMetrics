-- The columns `import_morning` was quietly leaving on the floor.
--
-- The rule this function exists for is right and has not changed: a morning that is not
-- today is created if it is missing and never overwritten, so a year of files can be dropped
-- in any order and can never take a number a person typed.
--
-- What was wrong is the list. `import_morning` was written when the schema had twenty
-- columns, and the schema has grown to forty-four: quality gained NCR and complaint counts
-- for the day, the month and the year; the plant asked for shipped dollars; OTD arrived
-- beside OTIF with a month and a year of its own. Every one of those was added to the tables,
-- to the cards and to the parsers, and none of them was added here — so a reading that
-- landed on the open morning was written and the same reading dated last Tuesday was read
-- out of the file, passed to this function, and dropped without a word.
--
-- That is the failure mode the whole product is built to avoid. An importer that silently
-- keeps half of what it read is worse than one that refuses the file, because the second
-- kind gets fixed.
--
-- Nothing else changes: same signature, same coalesce on every column, same skip for a
-- department this plant does not run.
create or replace function public.import_morning(loc text, d date, m jsonb, depts jsonb)
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
    -- On-time delivery for the month and the year. Derived from the OTD sheet's own daily
    -- rows, which is the only place either figure has ever existed.
    mtd_otd          = coalesce(t.mtd_otd,          (m->>'mtd_otd')::numeric),
    ytd_otd          = coalesce(t.ytd_otd,          (m->>'ytd_otd')::numeric),
    otd_target       = coalesce(t.otd_target,       (m->>'otd_target')::numeric),
    otif_target      = coalesce(t.otif_target,      (m->>'otif_target')::numeric),
    -- Quality, at all three horizons. The KPI workbook carries every one of them.
    ncr_today        = coalesce(t.ncr_today,        (m->>'ncr_today')::int),
    ncr_mtd          = coalesce(t.ncr_mtd,          (m->>'ncr_mtd')::int),
    ncr_ytd          = coalesce(t.ncr_ytd,          (m->>'ncr_ytd')::int),
    complaints_internal_today =
      coalesce(t.complaints_internal_today, (m->>'complaints_internal_today')::int),
    complaints_internal_mtd =
      coalesce(t.complaints_internal_mtd,   (m->>'complaints_internal_mtd')::int),
    complaints_internal =
      coalesce(t.complaints_internal,       (m->>'complaints_internal')::int),
    complaints_external_today =
      coalesce(t.complaints_external_today, (m->>'complaints_external_today')::int),
    complaints_external_mtd =
      coalesce(t.complaints_external_mtd,   (m->>'complaints_external_mtd')::int),
    complaints_external =
      coalesce(t.complaints_external,       (m->>'complaints_external')::int),
    -- Shipped dollars, from the same row of the same workbook.
    fin_actual_mtd   = coalesce(t.fin_actual_mtd,   (m->>'fin_actual_mtd')::numeric),
    fin_actual_ytd   = coalesce(t.fin_actual_ytd,   (m->>'fin_actual_ytd')::numeric),
    maintenance_note = coalesce(nullif(t.maintenance_note, ''), m->>'maintenance_note'),
    staffing_note    = coalesce(nullif(t.staffing_note, ''),    m->>'staffing_note')
  where t.location_id = loc and t.metric_date = d;

  -- A department in the file that this plant does not run is skipped rather than invented.
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
        make_ready = coalesce(t.make_ready, (body->>'make_ready')::numeric),
        -- The catch-up loop has been sending this for months and it was going nowhere.
        mr_count   = coalesce(t.mr_count,   (body->>'mr_count')::int)
      where t.location_id = loc and t.metric_date = d and t.dept_key = key;
    end if;
  end loop;
end;
$$;
