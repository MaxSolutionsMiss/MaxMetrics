-- On-time delivery beside on-time-in-full, and a carry-forward that knows about month ends.

-- ── OTD for the month and the year ─────────────────────────────────────────────
--
-- OTIF is on time *and* in full, so a job that shipped on the day but three cartons short
-- fails it. OTD counts only the date. The plant reads both because they answer different
-- arguments: "we hit every truck this month" and "then why is OTIF at ninety-two" is a
-- conversation the room has been having with one number missing from it.
--
-- Today's OTD has always been derived from jobs, late and short. These two are the running
-- figures, which nothing on a single morning can work out.
alter table public.daily_metrics
  add column if not exists mtd_otd numeric,
  add column if not exists ytd_otd numeric;

-- ── What carries to tomorrow, and what does not ────────────────────────────────
--
-- The rule was right and the boundaries were not. A month-to-date count carried forward on
-- the first of the month is August's figure standing in for September's, and it would have
-- read as September's until somebody imported a fresh workbook — on a card whose whole job
-- is to say how the month is going.
--
-- So the carry is now conditional on the previous morning being in the same period: the
-- month-to-date counts carry within a month, the year-to-date counts carry within a year,
-- and the safety streak and the standing targets carry always, because a record is a record
-- whatever the date is.
--
-- Everything else starts blank, which is what it already did — the row for a new morning is
-- new — and the list is worth writing down because it is what the plant asked for out loud:
--
--   blank every morning   the last twenty-four hours (status and note), jobs short, the
--                         three "today" counts, the whole of shipping, sales, overtime
--   carried               days since injury and near-miss and both records, COQ targets,
--                         month-to-date counts within a month, year-to-date within a year
--   pulled from the DOR   every production figure, and correctable afterwards
--   kept until closed     maintenance items, which belong to a date rather than to a morning
create or replace function public.carry_forward(loc text, d date)
returns void language plpgsql security definer set search_path = public, private as $$
declare prev record;
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;
  select metric_date,
         injury_last, injury_record, near_miss_last, near_miss_record,
         coq_target, coq_ytd_target,
         ncr_ytd, complaints_internal, complaints_external,
         ncr_mtd, complaints_internal_mtd, complaints_external_mtd into prev
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
    -- Within the same year only.
    ncr_ytd = case when date_trunc('year', prev.metric_date) = date_trunc('year', d)
                   then coalesce(m.ncr_ytd, prev.ncr_ytd) else m.ncr_ytd end,
    complaints_internal = case when date_trunc('year', prev.metric_date) = date_trunc('year', d)
                   then coalesce(m.complaints_internal, prev.complaints_internal)
                   else m.complaints_internal end,
    complaints_external = case when date_trunc('year', prev.metric_date) = date_trunc('year', d)
                   then coalesce(m.complaints_external, prev.complaints_external)
                   else m.complaints_external end,
    -- Within the same month only.
    ncr_mtd = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.ncr_mtd, prev.ncr_mtd) else m.ncr_mtd end,
    complaints_internal_mtd = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.complaints_internal_mtd, prev.complaints_internal_mtd)
                   else m.complaints_internal_mtd end,
    complaints_external_mtd = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.complaints_external_mtd, prev.complaints_external_mtd)
                   else m.complaints_external_mtd end
  where m.location_id = loc and m.metric_date = d;
end;
$$;

-- ── A booking whose date has gone by ───────────────────────────────────────────
--
-- Maintenance belongs to a date rather than to a morning, so an item stays on the list until
-- somebody closes it. What it must not do is stay on the list still calling itself
-- Scheduled: a job booked for last Thursday that nobody has touched is overdue, and the
-- upcoming card should say so rather than quietly implying it is still to come.
--
-- It is not marked Complete. Nobody has said the work was done, and a dashboard that decides
-- that on a plant's behalf is one that cannot be trusted about anything else.
create or replace function public.age_maintenance(loc text, d date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;
  update public.maintenance_items
     set status = 'Overdue'
   where location_id = loc
     and scheduled_on is not null
     and scheduled_on < d
     and status in ('Scheduled', 'Due Today');
end;
$$;
revoke all on function public.age_maintenance(text, date) from anon, public;
grant execute on function public.age_maintenance(text, date) to authenticated;
