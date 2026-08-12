-- The walk and the one page are two rooms, and now they have two lists.
--
-- `wall_hidden` has been doing both jobs. It is read by `wallPages()`, which builds the walk
-- the meeting is driven through *and* the single broadcast page — so a plant that wanted its
-- sales off the corridor TV had to take them out of the morning meeting as well, and the tick
-- that did it was labelled "One page", which was half true and the wrong half.
--
-- `wall_hidden` keeps its meaning: what is off the walk. `page_hidden` is what is off the one
-- page. Both hold section keys and card keys alike, because both questions are asked at both
-- levels — "not the money" and "not that one card" are the same kind of answer.
--
-- Nothing is migrated across. An existing `wall_hidden` entry meant "off the screens", which
-- is still true of the walk, and a plant that also wants it off the one page now says so once
-- more. Copying it over would be guessing at an intent the old tick could not express.
alter table public.locations
  add column if not exists page_hidden jsonb not null default '[]'::jsonb;

-- Which sections insist on a screen of their own.
--
-- Every section already gets its own slide, and the only thing that ever merged two was
-- `merge_upkeep` — one boolean for one pair, which is the shape a setting takes when it is
-- written for the first plant that asked. The general form is a list: a section named here
-- gets a slide to itself, and one that is not may be packed with its neighbours when it is
-- small enough that a slide of it alone would be three cards and a lot of wall.
--
-- `merge_upkeep` stays and keeps working. It is the same statement about one pair, and a
-- plant that has already set it should not have to set it again under a new name.
alter table public.locations
  add column if not exists solo_sections jsonb not null default '[]'::jsonb;
