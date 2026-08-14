-- Overtime says whether it is a weekday or a weekend.
--
-- "Gluing, three shifts" is two different facts depending on which. Three shifts on a
-- Tuesday is a plant catching up inside its normal week, at time and a half at worst, on
-- crews who are already in. Three shifts on a Saturday is the plant buying a day it does not
-- normally have, at a rate that is not time and a half, from people who had made other
-- plans — and the meeting treats the two completely differently. The card has been printing
-- one number for both since overtime was added, and the room has been asking which it is out
-- loud every morning.
--
-- Free text rather than an enumeration. Two values are what the room asked for and two values
-- is what the page offers, but a constraint here would have to be dropped the first time a
-- plant wants "statutory" or "shutdown" beside them, and the page already decides what may be
-- chosen. Blank means nobody has said, which is the honest state of most rows on most
-- mornings and is not the same as "weekday".
alter table public.daily_labour
  add column if not exists ot_when text;

comment on column public.daily_labour.ot_when is
  'Whether the overtime is inside the working week or at the weekend: ''weekday'', '
  '''weekend'', or blank where nobody has said. What the page offers is decided in the page.';
