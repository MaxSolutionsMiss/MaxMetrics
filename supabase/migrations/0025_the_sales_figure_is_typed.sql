-- The sales figure starts blank every morning and is typed by the person who knows it.
--
-- It has been read off the monthly KPI workbook's shipped-dollars column and carried forward
-- within the month, and between those two it has been wrong more often than it has been
-- right. The workbook is closed off a month at a time, so on the fourteenth of August its
-- newest row is July: the reader handed over July's whole month, the card called it "August
-- to date", and the screen reported 251% of budget on an ordinary Thursday. `fin_month` was
-- added to make that survivable — hand the month over with the figure and let the card say
-- which one it is looking at — and it made the label honest without making the figure right.
-- The number on the screen was still last month's.
--
-- Carrying compounded it. A figure that carries within the month means the morning after a
-- pull shows the pull's number again whether or not anybody has looked at it, so a wrong
-- figure entered once stayed on the wall until somebody typed over it.
--
-- The room's instruction is the simple one and the correct one: pull it from nowhere. The
-- entry screen has said "sales" is blank every morning since it was written; this is the
-- database finally agreeing with it. Two fields, typed on the morning they are about, with
-- nothing behind them to disagree with.
--
-- `fin_month` stays as a column. Mornings already recorded carry the month their figure was
-- for and dropping it would rewrite what those mornings said; nothing writes it from here on,
-- and a morning without one is read as its own month, which is exactly what a figure typed on
-- the day it is about means.
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
    -- Within the same month only.
    ncr_mtd = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.ncr_mtd, prev.ncr_mtd) else m.ncr_mtd end,
    complaints_internal_mtd = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.complaints_internal_mtd, prev.complaints_internal_mtd)
                   else m.complaints_internal_mtd end,
    complaints_external_mtd = case when date_trunc('month', prev.metric_date) = date_trunc('month', d)
                   then coalesce(m.complaints_external_mtd, prev.complaints_external_mtd)
                   else m.complaints_external_mtd end
    -- `fin_actual_mtd`, `fin_actual_ytd` and `fin_month` are deliberately absent. They are
    -- typed, on the morning they are about, and a figure that carries is a figure nobody has
    -- to look at.
  where m.location_id = loc and m.metric_date = d;
end;
$$;
