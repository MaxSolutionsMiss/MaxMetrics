-- A count nobody has touched is nought, not nothing.
--
-- The three "today" counts and the shortage count have been opening blank, and the reasoning
-- was careful and wrong for this plant: "no NCRs were raised" and "nobody has written one
-- down yet" are different statements, so the product refused to assert the first when all it
-- knew was the second. True — and the room's answer is better. Nothing happening is the
-- ordinary case on these four. A dash every morning is a card that says nothing three
-- hundred days a year and trains people to stop reading it, and the moment something *does*
-- happen the month-to-date count moves, which is a signal the product can see for itself.
--
-- So they open at nought. Anyone can type over it on the entry screen — that is what makes
-- the default safe rather than a claim — and `import_morning`, the pull and every typed
-- field still win over it, because this only ever fills a column that is null.
--
-- The zero-fill runs before the carry and outside its early return: the first morning a
-- plant ever opens has no previous day to carry from, and it needs these four all the same.
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
