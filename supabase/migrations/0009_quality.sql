-- Three quality readings the plant asks for and the dashboard could not hold.
-- Applied to metriq-development on 2026-08-07.
--
-- Quality has been sharing a section with safety since the start, and sharing it thinly:
-- a shortage count and two cost-of-quality figures. Those three are what the old dashboard
-- happened to carry, not what the meeting talks about.
--
-- The three added here are the ones a quality manager is actually asked for. NCRs are the
-- plant's own non-conformance reports, counted for the year rather than the day, because
-- one a day is noise and forty by August is a trend. Complaints are split by who raised
-- them: internal is the floor catching its own work, external is a customer catching it,
-- and treating those as one number hides the only distinction that matters — the second
-- kind has already left the building.

alter table public.daily_metrics
  add column ncr_ytd            int,
  add column complaints_internal int,
  add column complaints_external int;

comment on column public.daily_metrics.ncr_ytd is
  'Non-conformance reports raised this year to date.';
comment on column public.daily_metrics.complaints_internal is
  'Complaints raised inside the plant, year to date.';
comment on column public.daily_metrics.complaints_external is
  'Customer complaints, year to date. A different number from internal on purpose.';

-- These three are standing counts, not daily readings: they only ever go up within a year,
-- and a morning that has not been told otherwise inherits yesterday's rather than asking
-- somebody to retype three numbers that have not changed.
create or replace function public.carry_forward(loc text, d date)
returns void language plpgsql security definer set search_path = public as $$
declare prev record;
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;
  select injury_last, injury_record, near_miss_last, near_miss_record,
         coq_target, coq_ytd_target,
         ncr_ytd, complaints_internal, complaints_external into prev
  from public.daily_metrics where location_id = loc and metric_date < d
  order by metric_date desc limit 1;
  if found then
    update public.daily_metrics m set
      injury_last          = coalesce(m.injury_last,          prev.injury_last),
      injury_record        = coalesce(m.injury_record,        prev.injury_record),
      near_miss_last       = coalesce(m.near_miss_last,       prev.near_miss_last),
      near_miss_record     = coalesce(m.near_miss_record,     prev.near_miss_record),
      coq_target           = coalesce(m.coq_target,           prev.coq_target),
      coq_ytd_target       = coalesce(m.coq_ytd_target,       prev.coq_ytd_target),
      ncr_ytd              = coalesce(m.ncr_ytd,              prev.ncr_ytd),
      complaints_internal  = coalesce(m.complaints_internal,  prev.complaints_internal),
      complaints_external  = coalesce(m.complaints_external,  prev.complaints_external)
    where m.location_id = loc and m.metric_date = d;
  end if;
end;
$$;
