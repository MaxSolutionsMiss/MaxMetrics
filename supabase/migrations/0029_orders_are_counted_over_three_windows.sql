-- Orders logged and booked, over the three windows the meeting actually asks about.
--
-- The two counts arrived as a pair of year-to-date totals, because that is how the question
-- was first described: how many orders came in, how many are in Globetek, and the gap is
-- the backlog. Two things have since turned out to be true about it.
--
-- The first is that the gap is not a reading anybody wants. "Still to book" printed as
-- minus forty-six thousand on the card, which is what you get when a year of bookings is
-- subtracted from a week of orders — but even with both totals correct it is not a number
-- the plant has ever managed against. It has been dropped rather than fixed.
--
-- The second is that pre-production reports weekly, on a Monday, about the week that
-- finished. So the reading is not one total but three windows of the same two counts: what
-- came in and what was booked *last week*, which is the pair the meeting opens on; the same
-- two *month to date*, which is the pace the month is setting; and the year, which is the
-- size of the thing. The source supports all three without anybody typing a figure —
-- `Orders booked vs orders logged` is a dated table, one row per day, with the orders logged
-- in one column and the orders booked into Globetek in the next, so every window is a sum
-- over a date range rather than a number somebody has to remember to update.
--
-- The two columns already here keep their names and become the year to date, because that
-- is what they have always held and renaming them would strand the readings taken so far.
alter table public.daily_metrics
  add column if not exists csr_orders_logged_wk  int,
  add column if not exists csr_orders_booked_wk  int,
  add column if not exists csr_orders_logged_mtd int,
  add column if not exists csr_orders_booked_mtd int;

comment on column public.daily_metrics.csr_orders_logged_wk is
  'Orders logged over the last complete week — Monday to Sunday, the week before the one '
  'this morning falls in. The figure pre-production reports on a Monday.';
comment on column public.daily_metrics.csr_orders_booked_wk is
  'Orders booked into Globetek over that same week.';
comment on column public.daily_metrics.csr_orders_logged_mtd is
  'Orders logged from the first of this month to this morning.';
comment on column public.daily_metrics.csr_orders_booked_mtd is
  'Orders booked into Globetek from the first of this month to this morning.';
comment on column public.daily_metrics.csr_orders_logged is
  'Orders logged from the first of January to this morning.';
comment on column public.daily_metrics.csr_orders_booked is
  'Orders booked into Globetek from the first of January to this morning.';
