-- Cost of quality is never month to date, and the card should stop saying it is.
--
-- The plant does not know this month's cost of quality this month. The claims, the reruns,
-- the scrap and the credits are totted up after the month closes, so the figure on the card
-- every morning of August is July's — a closed month, final, and not moving again. Calling
-- it "month to date" told the room the opposite: that it was August's, running, and would
-- change by the end of the month. Everything downstream followed the label. The seven-day
-- line under it was justified in a comment as "the shape of a month-to-date figure creeping
-- up", which is a shape this reading cannot have.
--
-- The fix needs one fact the product never kept: *which* month the figure is for. It is in
-- the workbook — the reader already picks a row and knows its name — and it was thrown away
-- at the door. `coq_month` is the first of that month, so a card can say "COQ — July" and be
-- right in August, right on the first of September, and right without anybody maintaining a
-- second setting that says how far behind the figure runs.
alter table public.daily_metrics
  add column if not exists coq_month date;

comment on column public.daily_metrics.coq_month is
  'First of the month the cost-of-quality figure covers — the last month closed off, which '
  'is not the month the reading was taken in.';

-- Carried, like the other readings that are true until something replaces them.
--
-- Cost of quality was not carried forward, and the reason it looked fine is that the morning
-- pull rewrote it every day. A morning where the pull does not run — a holiday, a flow that
-- failed, a plant reading a day it has reopened — had a blank COQ card, and the card was
-- blank about a figure that had not changed since the month closed. A closed month's cost of
-- quality is exactly the kind of fact that carries: it is settled.
--
-- `coq` and `coq_month` carry unconditionally, because December's figure is still the last
-- closed month on the second of January. `coq_ytd` carries within the year only, the same
-- rule the other year-to-date columns already follow.
create or replace function public.carry_forward(loc text, d date)
returns void language plpgsql security definer set search_path = public, private as $$
declare prev record;
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;

  update public.daily_metrics m set
    ncr_today                 = coalesce(m.ncr_today, 0),
    complaints_internal_today = coalesce(m.complaints_internal_today, 0),
    complaints_external_today = coalesce(m.complaints_external_today, 0),
    shortages                 = coalesce(m.shortages, 0)
  where m.location_id = loc and m.metric_date = d;

  select metric_date,
         injury_last, injury_record, near_miss_last, near_miss_record,
         coq, coq_month, coq_ytd, coq_target, coq_ytd_target,
         ncr_ytd, complaints_internal, complaints_external,
         ncr_mtd, complaints_internal_mtd, complaints_external_mtd,
         fin_actual_mtd, fin_actual_ytd into prev
  from public.daily_metrics where location_id = loc and metric_date < d
  order by metric_date desc limit 1;
  if not found then return; end if;

  update public.daily_metrics m set
    injury_last          = coalesce(m.injury_last,          prev.injury_last),
    injury_record        = coalesce(m.injury_record,        prev.injury_record),
    near_miss_last       = coalesce(m.near_miss_last,       prev.near_miss_last),
    near_miss_record     = coalesce(m.near_miss_record,     prev.near_miss_record),
    coq_target           = coalesce(m.coq_target,           prev.coq_target),
    coq_ytd_target       = coalesce(m.coq_ytd_target,       prev.coq_ytd_target),
    -- A closed month stays closed. These two travel together or the card names a month it
    -- is not showing.
    coq                  = coalesce(m.coq,                  prev.coq),
    coq_month            = coalesce(m.coq_month,            prev.coq_month),
    -- Within the same year only.
    coq_ytd = case when date_trunc('year', prev.metric_date) = date_trunc('year', d)
                   then coalesce(m.coq_ytd, prev.coq_ytd) else m.coq_ytd end,
    ncr_ytd = case when date_trunc('year', prev.metric_date) = date_trunc('year', d)
                   then coalesce(m.ncr_ytd, prev.ncr_ytd) else m.ncr_ytd end,
    complaints_internal = case when date_trunc('year', prev.metric_date) = date_trunc('year', d)
                   then coalesce(m.complaints_internal, prev.complaints_internal)
                   else m.complaints_internal end,
    complaints_external = case when date_trunc('year', prev.metric_date) = date_trunc('year', d)
                   then coalesce(m.complaints_external, prev.complaints_external)
                   else m.complaints_external end,
    fin_actual_ytd = case when date_trunc('year', prev.metric_date) = date_trunc('year', d)
                   then coalesce(m.fin_actual_ytd, prev.fin_actual_ytd)
                   else m.fin_actual_ytd end,
    -- Within the same month only.
    ncr_mtd = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.ncr_mtd, prev.ncr_mtd) else m.ncr_mtd end,
    complaints_internal_mtd = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.complaints_internal_mtd, prev.complaints_internal_mtd)
                   else m.complaints_internal_mtd end,
    complaints_external_mtd = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.complaints_external_mtd, prev.complaints_external_mtd)
                   else m.complaints_external_mtd end,
    fin_actual_mtd = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.fin_actual_mtd, prev.fin_actual_mtd)
                   else m.fin_actual_mtd end
  where m.location_id = loc and m.metric_date = d;
end;
$$;

-- And the history importer learns the column, so a backfilled morning names its month too.
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
    maintenance_note = coalesce(nullif(t.maintenance_note, ''), m->>'maintenance_note'),
    staffing_note    = coalesce(nullif(t.staffing_note, ''),    m->>'staffing_note')
  where t.location_id = loc and t.metric_date = d;

  insert into public.daily_departments (location_id, metric_date, dept_key, qty, hours, target,
                                        uptime, make_ready, mr_count, pw_qty, pw_hours)
  select loc, d, key,
         (value->>'qty')::numeric, (value->>'hours')::numeric, (value->>'target')::numeric,
         (value->>'uptime')::numeric, (value->>'make_ready')::numeric, (value->>'mr_count')::int,
         (value->>'pw_qty')::numeric, (value->>'pw_hours')::numeric
    from jsonb_each(coalesce(depts, '{}'::jsonb))
  on conflict (location_id, metric_date, dept_key) do update set
    qty        = coalesce(public.daily_departments.qty,        excluded.qty),
    hours      = coalesce(public.daily_departments.hours,      excluded.hours),
    target     = coalesce(public.daily_departments.target,     excluded.target),
    uptime     = coalesce(public.daily_departments.uptime,     excluded.uptime),
    make_ready = coalesce(public.daily_departments.make_ready, excluded.make_ready),
    mr_count   = coalesce(public.daily_departments.mr_count,   excluded.mr_count),
    pw_qty     = coalesce(public.daily_departments.pw_qty,     excluded.pw_qty),
    pw_hours   = coalesce(public.daily_departments.pw_hours,   excluded.pw_hours);
end;
$$;
