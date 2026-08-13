-- Last week keeps uptime and make-ready, not just what it made.
--
-- The card is one line per department: what the same weekday produced a week ago, against
-- target. Two columns have always held it — `pw_qty` and `pw_hours` — and the room's ask is
-- for the other two readings a department is judged on to sit beside them, so a week-on-week
-- comparison is the same three figures the daily card shows rather than one of them.
--
-- Nothing new has to be read to do it. The importer already rolls the previous week up
-- exactly as it rolls today up, which produces uptime and make-ready in the same pass; both
-- were computed and thrown away because there was nowhere to put them. These are the places.
alter table public.daily_departments
  add column if not exists pw_uptime     numeric,
  add column if not exists pw_make_ready numeric,
  add column if not exists pw_mr_count   int;

comment on column public.daily_departments.pw_uptime is
  'Uptime for the same weekday a week ago, on the same definition as `uptime`: '
  '(make-ready + run) over crewed.';
comment on column public.daily_departments.pw_make_ready is
  'Average make-ready for the same weekday a week ago — MR hours over the number of '
  'make-readies, which is why `pw_mr_count` is kept beside it.';

-- The history importer learns the three columns, so a backfilled morning carries its own
-- comparison rather than acquiring one only when the next pull happens to run.
create or replace function public.import_morning(
  loc text, d date, m jsonb, depts jsonb
) returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;

  insert into public.daily_metrics (location_id, metric_date)
  values (loc, d) on conflict do nothing;

  update public.daily_metrics t set
    injury_last      = coalesce(t.injury_last,      (m->>'injury_last')::date),
    injury_record    = coalesce(t.injury_record,    (m->>'injury_record')::int),
    near_miss_last   = coalesce(t.near_miss_last,   (m->>'near_miss_last')::date),
    near_miss_record = coalesce(t.near_miss_record, (m->>'near_miss_record')::int),
    shortages        = coalesce(t.shortages,        (m->>'shortages')::int),
    coq              = coalesce(t.coq,              (m->>'coq')::numeric),
    coq_month        = coalesce(t.coq_month,        (m->>'coq_month')::date),
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
    mtd_otd          = coalesce(t.mtd_otd,          (m->>'mtd_otd')::numeric),
    ytd_otd          = coalesce(t.ytd_otd,          (m->>'ytd_otd')::numeric),
    otd_target       = coalesce(t.otd_target,       (m->>'otd_target')::numeric),
    otif_target      = coalesce(t.otif_target,      (m->>'otif_target')::numeric),
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
    fin_actual_mtd   = coalesce(t.fin_actual_mtd,   (m->>'fin_actual_mtd')::numeric),
    fin_actual_ytd   = coalesce(t.fin_actual_ytd,   (m->>'fin_actual_ytd')::numeric),
    fin_month        = coalesce(t.fin_month,        (m->>'fin_month')::date),
    maintenance_note = coalesce(nullif(t.maintenance_note, ''), m->>'maintenance_note'),
    staffing_note    = coalesce(nullif(t.staffing_note, ''),    m->>'staffing_note')
  where t.location_id = loc and t.metric_date = d;

  insert into public.daily_departments (location_id, metric_date, dept_key, qty, hours, target,
                                        uptime, make_ready, mr_count,
                                        pw_qty, pw_hours, pw_uptime, pw_make_ready, pw_mr_count)
  select loc, d, key,
         (value->>'qty')::numeric, (value->>'hours')::numeric, (value->>'target')::numeric,
         (value->>'uptime')::numeric, (value->>'make_ready')::numeric, (value->>'mr_count')::int,
         (value->>'pw_qty')::numeric, (value->>'pw_hours')::numeric,
         (value->>'pw_uptime')::numeric, (value->>'pw_make_ready')::numeric,
         (value->>'pw_mr_count')::int
    from jsonb_each(coalesce(depts, '{}'::jsonb))
  on conflict (location_id, metric_date, dept_key) do update set
    qty           = coalesce(public.daily_departments.qty,           excluded.qty),
    hours         = coalesce(public.daily_departments.hours,         excluded.hours),
    target        = coalesce(public.daily_departments.target,        excluded.target),
    uptime        = coalesce(public.daily_departments.uptime,        excluded.uptime),
    make_ready    = coalesce(public.daily_departments.make_ready,    excluded.make_ready),
    mr_count      = coalesce(public.daily_departments.mr_count,      excluded.mr_count),
    pw_qty        = coalesce(public.daily_departments.pw_qty,        excluded.pw_qty),
    pw_hours      = coalesce(public.daily_departments.pw_hours,      excluded.pw_hours),
    pw_uptime     = coalesce(public.daily_departments.pw_uptime,     excluded.pw_uptime),
    pw_make_ready = coalesce(public.daily_departments.pw_make_ready, excluded.pw_make_ready),
    pw_mr_count   = coalesce(public.daily_departments.pw_mr_count,   excluded.pw_mr_count);
end;
$$;
