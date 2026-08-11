-- Maintenance and Labour are two screens by default now, not one.
--
-- `split_upkeep` asked the opposite question ("keep them apart?") and defaulted to false, so
-- every plant got them merged: a booking list and a shift count under one heading, and the
-- tallest screen in the product made out of two short ones. The default is the thing being
-- changed, and a default is a lie if the column has to be read backwards to see it — so the
-- column is renamed to the question actually being asked and every existing answer is
-- carried across inverted, which leaves any plant that had deliberately split them still
-- split.
alter table locations add column if not exists merge_upkeep boolean not null default false;

update locations set merge_upkeep = not coalesce(split_upkeep, false);

alter table locations drop column if exists split_upkeep;
