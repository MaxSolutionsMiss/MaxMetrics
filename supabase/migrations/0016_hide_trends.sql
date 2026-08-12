-- The seven-day line, off if a plant does not want it.
--
-- It is the right default: a figure with no history behind it is a figure with no context,
-- and the line is the cheapest context there is. But it is also the busiest thing on a card
-- and a plant reading the morning off a wall at eight feet may want the number and nothing
-- else. Per plant rather than per card, because "which of my thirty cards have a trend line"
-- is not a question anybody wants to answer thirty times.
alter table locations add column if not exists hide_trends boolean not null default false;
