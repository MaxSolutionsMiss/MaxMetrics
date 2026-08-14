-- Customer service gets two readings of its own.
--
-- Front of house has been a card of sentences since it was added: what the CSRs, the die
-- shop, prepress and supply chain want the floor to know this morning. It is the one section
-- with nothing measured in it, and the two things the plant does measure about it live in a
-- workbook nobody at the meeting opens.
--
-- **How long a confirmation takes.** The corporate goal is that a customer has their order
-- confirmed within three days of sending the purchase order. The docket-flow tracker keeps
-- both dates on every line — when the PO arrived and when customer service sent the
-- confirmation — so the reading is the mean of the gap between them, over the month and over
-- the year. Days, one decimal, and lower is better: it is the only reading on the product
-- where three is the ceiling rather than the floor.
--
-- Two columns rather than one and a date, because the two windows do not move together. A
-- month that starts badly and recovers is a different story from a year that has been drifting
-- since March, and the room asks for both in the same breath.
--
-- **Orders logged against orders booked.** How many orders came in from customers, and how
-- many of those have been booked into Globetek. No target — the plant has not set one and
-- inventing one here would put a colour on a card that means nothing. Two counts side by
-- side, which is what the meeting reads them as: the gap is the backlog.
alter table public.daily_metrics
  add column if not exists csr_confirm_mtd   numeric,
  add column if not exists csr_confirm_ytd   numeric,
  add column if not exists csr_orders_logged int,
  add column if not exists csr_orders_booked int;

comment on column public.daily_metrics.csr_confirm_mtd is
  'Mean days between the purchase order arriving and customer service confirming it, over '
  'the orders confirmed this month. The goal is three days or fewer.';
comment on column public.daily_metrics.csr_confirm_ytd is
  'The same mean over the year to date.';
comment on column public.daily_metrics.csr_orders_logged is
  'Orders received from customers, year to date.';
comment on column public.daily_metrics.csr_orders_booked is
  'Orders booked into Globetek, year to date. The gap against logged is the backlog.';
