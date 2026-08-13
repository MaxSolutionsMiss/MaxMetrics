-- Monday's look back at the week that finished.
--
-- The morning meeting reports the last twenty-four hours every day, and once a week it also
-- reports the week — what each department made, how fast, how much of its crewed time it
-- actually ran, and how long its changeovers took. Every one of those figures is already in
-- `daily_departments`, one row per department per morning; what was missing was somewhere to
-- say the plant wants them added up and shown.
--
-- The card is a Monday card. That is a rule about the meeting, not about the data, so it is
-- decided in code from the day of the week rather than stored — a plant does not need a
-- setting to tell it what day it is. What a plant *does* need is a way to overrule it, which
-- is this column: some weeks the review slips to Tuesday, and a plant driving a shutdown may
-- want last week in front of it every morning until the backlog is cleared.
--
-- Off by default, because a card that appears every day is no longer a weekly review.
alter table public.locations
  add column if not exists week_daily boolean not null default false;

comment on column public.locations.week_daily is
  'Show the Last week section every morning rather than only on Mondays.';
