-- Sales carry to tomorrow, inside their own period.
--
-- The plant enters shipped dollars by hand and the two financial cards read them month to
-- date and year to date. Neither was in `carry_forward`, so every morning opened with both
-- blank and the cards read nothing until somebody retyped a figure that had not changed
-- since yesterday — on the one section nobody is going to notice is empty, because an empty
-- money card looks like a quiet month.
--
-- They belong with the counts that already carry: a month-to-date figure is true of the
-- month, not of the morning, so it carries within a month and stops at the first; a
-- year-to-date figure carries within a year. Same two conditions, same reason, and an
-- import or a person typing still wins because every carried column is `coalesce(mine,
-- yesterday's)` and the carry runs when the day is opened.
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
    -- Within the same year only.
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
