-- Feb–Apr 2026 in daily_departments hold month-to-date running totals, not day figures.
--
-- What happened: from 2 February to 29 April 2026 every additive column — qty, hours and
-- mr_count — carries the month's running total rather than that day's own number. It resets
-- on the first of each month and climbs from there. Three months, 186 rows, one plant.
--
-- Why nobody saw it: the numerator and the denominator inflate together, so output per
-- crewed hour stays right. The morning dashboard shows the rate, and the rate was correct
-- every single day. Only the totals are wrong — which is exactly the number Metrics would
-- have been asked for.
--
-- The averages (uptime, make_ready) were never affected; they sit in the normal range
-- throughout, so they are left alone.
--
-- The repair: a running total is undone by subtracting the day before it. The first day of
-- each month is already correct and stays as it is. Verified before writing: no reconstructed
-- day is negative, and the largest is 109 crewed hours, which matches the biggest ordinary
-- day in the months either side. If the corruption were something other than accumulation,
-- both of those checks would fail.

-- Run against maxmetrics-development on 20 August 2026. 186 rows rewritten. The rows as
-- they stood beforehand are kept in `dd_backup_2026_02_04`, so this is reversible.
--
-- After: February die cutting reads 2,041,432 sheets over 1,013 crewed hours, against
-- January's 1,837,589 over 975.5 and December's 2,106,975 over 1,031 — the three months now
-- sit alongside their neighbours instead of twenty times above them. Output per crewed hour
-- did not move, which is the proof that only the totals were ever wrong.

begin;

create temp table dd_fix on commit drop as
with s as (
  select location_id, metric_date, dept_key, qty, hours, mr_count,
         row_number() over w  as rn,
         lag(qty)      over w as prev_qty,
         lag(hours)    over w as prev_hours,
         lag(mr_count) over w as prev_mr
  from daily_departments
  where location_id = 'mississauga'
    and metric_date >= date '2026-02-01'
    and metric_date <  date '2026-05-01'
  window w as (partition by location_id, dept_key, date_trunc('month', metric_date)
               order by metric_date)
)
select location_id, metric_date, dept_key,
       case when rn = 1 then qty      else qty      - coalesce(prev_qty,   0) end as qty,
       case when rn = 1 then hours    else hours    - coalesce(prev_hours, 0) end as hours,
       case when rn = 1 then mr_count else mr_count - coalesce(prev_mr,    0) end as mr_count
from s;

-- Refuse the whole repair rather than write a day that cannot be true.
do $$
declare bad int;
begin
  select count(*) into bad from dd_fix
   where qty < 0 or hours < 0 or mr_count < 0 or hours > 200;
  if bad > 0 then
    raise exception 'Repair refused: % reconstructed rows are impossible', bad;
  end if;
end $$;

update daily_departments d
   set qty = f.qty, hours = f.hours, mr_count = f.mr_count, updated_at = now()
  from dd_fix f
 where d.location_id = f.location_id
   and d.metric_date = f.metric_date
   and d.dept_key    = f.dept_key;

commit;
