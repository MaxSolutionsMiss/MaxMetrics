-- The sales figure names the month it covers, for the same reason cost of quality does.
--
-- `readKpi` picks the latest month row at or before the morning's own month and reads the
-- sales column off it. On the twelfth of August, with August's row not yet filled in, that
-- row is July — so `fin_actual_mtd` held July's *whole month* of sales, the card called it
-- "Month to date", and the Financials screen measured it against August's budget prorated to
-- the twelfth day. Twelve days of budget under a full month of sales is how a card comes to
-- report 251% of budget on an ordinary Thursday.
--
-- This is the cost-of-quality mistake in a second place, and it has the same fix: keep the
-- month the figure is for, beside the figure. Then the card can say "July" and measure it
-- against July's whole budget, and say "August month to date" and prorate, without anybody
-- maintaining a setting about how far behind the workbook runs.
--
-- `fin_month` is the first of the month the sales figure covers.
alter table public.daily_metrics
  add column if not exists fin_month date;

comment on column public.daily_metrics.fin_month is
  'First of the month the sales figures cover. Equal to the morning''s own month when the '
  'workbook has a live month-to-date row; an earlier month when it has not been filled in '
  'yet, in which case the figure is that month''s whole.';

-- Carried with the figures it describes.
--
-- `fin_actual_mtd` and `fin_actual_ytd` already carry — the first within a month, the second
-- within a year — and the month carries on the same rule as the figure it belongs to. A
-- month that carries without its name would leave the card labelling July's sales August.
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
         fin_actual_mtd, fin_actual_ytd, fin_month into prev
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
                   else m.fin_actual_mtd end,
    -- The name travels with the figure. Where the figure did not carry, neither does this.
    fin_month = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.fin_month, prev.fin_month)
                   else m.fin_month end
  where m.location_id = loc and m.metric_date = d;
end;
$$;

-- And the history importer learns it, so a backfilled morning names its month too.
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
