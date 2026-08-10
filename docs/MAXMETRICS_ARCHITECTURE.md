# MaxMetrics architecture

The decisions that are expensive to reverse, and why each was made. If a rule here has no
reason attached, it should be deleted rather than followed.

## Why not SharePoint

Ticket #5439 asked IT to package the dashboard as an SPFx web part. That request was
correct for SharePoint and would not have solved the actual problem.

The dashboard's limitation was never hosting. It was that `Daily_Morning_Dashboard_Vr 22`
kept a whole day in one `localStorage` blob, so one person had to finish before the next
could start. A SharePoint list holding one JSON blob per date reproduces that exactly:
three people editing means three read-modify-writes of the same blob, and the last one
wins. The morning would still be serialised, now over the network.

Postgres with a column per reading removes the serialisation itself. That is the whole
reason for the platform choice, and it is why the SPFx ticket can be closed rather than
waited on.

## Nothing locks a day

The strongest rule in the system. There is no edit lock, no checkout, no "someone else is
editing" refusal.

- Every reading is its own column, and a save sends only the column that changed.
- Two people in two fields are two independent `UPDATE`s. Neither carries the other's
  stale value back over the top of it.
- Two people in the *same* field resolve last-write-wins, exactly as a shared spreadsheet
  does. This is rare and understood; a lock to prevent it would cost far more than it saves.
- `ensure_day` is idempotent, so three people opening 06:58 together do not race to create
  the day's row.

`Enter data` shows the input fields. It is a personal view preference, stored on the
person, and two people can have it on at once.

## Presence is not permission

Presence tells you who else is here and which reading they are in. It never grants or
withholds anything. It is a channel write, not a database write, so moving around the page
costs nothing and a colleague's marker appearing cannot fail a save.

Presence repaints class names onto the page that is already there. Rebuilding the DOM when
a colleague moves would take the caret out of whatever someone is typing into, which is the
one thing a shared editor may never do.

## Judgement lives in one place

`band()` in `js/readings.js` decides whether a number is good. Nothing else may.

A card, the dot beside its section in the rail, and the colour of a ring are three
renderings of one verdict. If any of them could compute its own threshold, they would
eventually disagree, and a dashboard that contradicts itself is worse than no dashboard.
The conformance check in `scripts/verify-maxmetrics.mjs` fails the build if a threshold
appears anywhere else.

This is also what makes the drawing a free choice. A bar, a ring and a number all receive a
verdict already reached. Swapping one for another changes the shape and cannot change the
answer.

## The drawing belongs to the reading, not to the reader

There was a picker — number, bar, ring, gauge — and it applied one choice to every card at
once. That was already an improvement on mixing them, because a screen of mixed shapes cannot
be compared across. But it was still the wrong question: the reader was being asked to choose
between four ways of drawing a reading, when only one of them is right for any given reading,
and which one depends on the reading rather than on who is looking.

So there is one shape now — **the number, and the evidence for it underneath** — and what the
evidence is depends on what the number is:

| Reading | Under it |
|---|---|
| A production rate | a bar against target, and the last seven mornings |
| OTD and OTIF | a bar against 98%, and the last seven mornings |
| Cost of quality | a bar against the ceiling, and no line — a month-to-date figure drawn as seven daily readings is a slope that means nothing |
| Sales | a bar against the budget expected by today |
| A safety streak | the record as a **marker** on an unbanded track, which the fill runs past |
| A count — late, shorts, shortages | the last seven mornings. No bar: a count has no denominator, and a bar against a target of zero is always full |
| A running total — NCRs, complaints | the last seven mornings, which is flat while nothing happens and steps the morning something does |

The streak is the one worth spelling out, because two things about it are easy to get wrong.
It is not measured against the record the way a rate is measured against target — a record is
a target to *beat*, not one to meet — so the scale ends past whichever of the two is larger
and the marker sits partway along. Short of the record, the gap is the picture; past it, the
distance past is. Drawn as an ordinary bar it would pin full the morning the record fell and
say the same thing every morning after.

And it carries no bands. The red-amber-green ground under a bar means "short of this is a
miss", which is true of a rate and false of a record: ten days since the last near-miss on a
red field says the plant is failing at something it is not failing at.

A count gets no bar for the same family of reasons, but it does get a line. Two shortages is
a number; two shortages after one, nought, three, two, one and four is a pattern, and the
pattern is the thing worth putting on a wall.

## Which cards a plant carries

One list on the plant, `hidden_cards`, checked by `metricCard()` itself. It was three columns
— `show_ncr`, `show_internal`, `show_external` — covering the three quality readings nobody
could agree were universal, while every other card on the dashboard was hard-wired on. A
plant that ships on pallets and does not count cartons had exactly the problem those three
had: a card that reads a permanent dash teaches the room that a blank is normal.

Turning one off returns nothing from the one function that builds cards, so it leaves nothing
behind — no empty cell, no gap in a row of four. The arrangement is worked out afterwards
from what is left, so hiding two of Shipping's eight re-deals it from four across to three.

## A table is not a card, so it never reached the wall

Maintenance's schedule and Labour's department breakdown were tables, and only cards go up on
the wall — so those two sections went up with two cards each and half a screen of nothing
under them. But they are readings like any other: which departments, and what state each one
is in. `listCard()` and `noteCard()` draw them with the same bar, the same body and the same
grid, so a screen of them is still a screen of cards and the arrangement is chosen the same
way. Maintenance is four now — overdue, open, today's schedule, notes — and Labour is four:
shifts, departments, the breakdown, and staffing. Each is in the catalogue, so a plant that
does not want one unticks it and the screen re-deals.

## Reading against a target

A number alone does not say whether it is good. Every reading is drawn against the thing it
is measured by:

- a safety streak against the record it is chasing, with the record drawn as a number in
  its own right because it is what people are trying to beat
- a production rate against the target per hour
- COQ against the percentage-of-sales target
- MTD and YTD sales against a budget prorated by elapsed days

Financials report through the **day before** the dashboard date, because billing is
reviewed the following morning. A dashboard dated 1 July reports through 30 June.

## Sizing

Every card is a CSS container and every hero number is capped in `cqi`, so a number is
sized against the width it actually got. This is what allows a department card to be narrow
without its rate overflowing, which in turn is what gives the Previous Week table the width
it needs — the specific complaint that ran through several versions of the old file.

Present mode is verified to fit with no scrollbar at 1366×768, 1600×900, 1920×1080 and
2560×1440. Type is not pegged to viewport breakpoints — it is pegged to the card, which is
the whole subject of *One card* below.

**A card is as tall as the tallest card.** An earlier version stretched each section to the
viewport and the cards with it, so three lines of a review note sat at the top of a
four-hundred-pixel card and the rest was empty ground; a later one let each row find its own
height, which gave one section a 305px row above a 220px row. Neither is a page. The height
is declared once, from the card that carries the most — a bar, a trend line and a three-part
foot — and the cards with less spend the difference on air. Air reads as deliberate. Five
heights read as a fault.

Which means their contents centre rather than sitting at the top. Top-anchoring was right
when a card was as tall as its contents; with one height for all of them it left safety's
number stranded under the title with its context four hundred pixels below. Cards in a row
still share the line their numbers sit on, which is the part that always mattered: the head
reserves the same height whether or not it holds a flag, so reading a row is one sweep
rather than five hunts.

## Looking like the dashboard it replaces

The plant has been reading one dashboard since January and the room knows where to look, so
MaxMetrics keeps its visual grammar rather than inventing a better one: a pictogram and a
title in condensed capitals at the top of every card, the number large and centred
underneath, the whole card washed green, amber or red, and section headings set small
between two rules. The icons are the plant's own — ⚕️ for the injury streak, 🖨️ ✂️ 📦 for the
three departments, 🚚 for shipping.

The two faces are the ones the old file asked for and never got. A single HTML file on a
network share had nowhere to load a webfont from, so `Barlow Condensed` fell through to
whatever Windows happened to have — usually Arial Narrow — and the look was an accident.
Loading Barlow and Barlow Condensed properly makes every desk and the TV agree, and the
same fallback chain still applies if the plant is offline.

Numbers are set at weight 500, not bold. A condensed face at fifty pixels and 700 closes
its own counters, and a 6 begins to read as an 8 from across a room — the one thing a
number on a wall may not do.

## Security

- The publishable key ships in the page. It is designed to; every table is behind row-level
  security and the key grants nothing on its own.
- The service-role key must never appear in client code. The conformance check fails the
  build if it does.
- Access helpers (`has_location`, `can_edit_location`, `is_admin`) live in the `private`
  schema. In `public` they would also be REST endpoints, which is a surface nobody needs.
- `ensure_day` and `carry_forward` are reachable by signed-in users because the app calls
  them, and each checks edit access itself before doing anything.
- The edit trail is append-only. A record of who typed what is worth nothing if it can be
  edited afterwards.

## Reading against a target, on the card

Every card carries a bar showing the reading against its target and a line showing its last
seven mornings. Before that, only Today and the Board answered the two questions the room
asks after "what is it" — "against what" and "which way is it going" — and the sections
themselves printed a figure, a caption and a row of foot stats over two thirds of an empty
page.

Three things fell out of putting the drawings on the cards, and all three were bugs the
page had been carrying quietly because nothing drew them side by side:

- The bullet's bands were stacked from the left, which is right for make-ready and exactly
  backwards for everything else. A department beating its target sat on an amber field and
  one missing it sat on a green one.
- A percentage was scaled to a third above its target, so OTIF's marker sat a fifth of the
  way along a bar whose remaining four fifths nobody can ever reach. Percentages now carry a
  ceiling as well as a floor.
- The trend chip coloured up green and down red, which put a green ▲ 51% beside a cost of
  quality climbing away from target on a card the same page had painted red. The arrow says
  which way; the colour says whether that was good.

The bar is dropped when the reader has chosen the bar chart style, because the drawing
already is a bar against a target and the same card must not answer the same question
twice.

## The section verdict, and why it is gone

There used to be a sentence under each section heading saying what the section came to.
It is gone: the room reads the cards, and on a wall it put body copy above numbers set at
two hundred pixels. `verdicts()` still runs, because the rail's status dots are its tones,
and a dot is the right size for a summary.

What follows is why it was built the way it was, and is still true of the dots.

It states, it does not judge. Every word comes from a reading `assess()` has already decided
about, and the clause naming what is wrong is written beside the reading in `assess.js` —
that is the only place that knows a shortfall is measured in sheets and a streak in days.

The tone it carries is the same tone the dot beside the section in the rail carries, because
the rail now asks `verdicts()` for it instead of working it out again from its own copy of
the thresholds. That was the last place two parts of MaxMetrics could form separate opinions
about the same morning, and putting the two renderings next to each other found it
immediately: the financials card is washed by the worse of month and year to date, but the
assessment only produced a reading for the month, so a month ahead of plan inside a year
behind it printed a red card over a section reporting everything on target.

## A plant's own shape

`location_departments` was three seeded rows and a migration, which meant the second plant
to open MaxMetrics would have waited on this repository to see its own floor. Configure
Departments makes those rows editable, and adds the labels that make a department its own:
windowing counts panes and is crewed in machine hours, and a plant reading "sheets/hr" over
it is being shown a dashboard built for somebody else.

- The labels default to empty and every reader falls back to what it printed before, so a
  plant that never opens the screen sees no change at all.
- A department is never deleted, only taken out of use. The mornings it appeared on are
  still in `daily_departments` keyed by it, and a key with no name behind it turns a
  recorded reading into an orphan.
- A key is generated, never typed, and the table refuses one that is not a slug. It is
  permanent, it is what three tables carry, and it is what the dashboard's
  `dept:key:field` routing splits on — a colon in it would send a save to the wrong table.
- Adding a department mid-morning calls `ensure_day` again, and the daily writes became
  upserts. An `UPDATE` matching no row reports success while losing the number somebody just
  typed.

## Two seconds

A card is read from across a room in about two seconds, and everything on it competes for
those two seconds. That is the whole design brief, and most of what has been removed from
a card was removed against it:

- **Titles are one line, always.** Two lines' worth of room was reserved for every title so
  the numbers underneath would align, which bought the alignment with a band of empty space
  on top of every short-titled card. The title shrinks to fit instead, and it is set at 600
  rather than 700 because at the old weight it was competing with the reading.
- **The foot is one line, not a grid.** Four labelled readings in two rows meant twenty
  labels across a row of five cards, and a two-second glance cannot enter a table. What
  qualifies a number is a sentence — record 136 days, last injury 20 November — so it is
  set as one. Pairs with nothing in them are dropped rather than printed as dashes.
- **No coloured cap.** Three pixels of saturated status colour across the top of every card
  made the page a set of bars before it was a set of readings. The wash and the border
  carry the verdict quietly enough that the number stays the loudest thing.
- **The flag is outlined, not filled.** A solid block of status colour under the title was
  the second loudest thing on the card, and it is a footnote.
- **The bar and the line are optional.** A safety streak has no trend worth drawing — a
  counter that goes up by one a day is a diagonal — and a target of nought has no bar.
  Drawing both on every card taught the eye to ignore all of them, including the ones that
  meant something.

Two typefaces, again. One was the tidier rule and it cost the titles: a condensed face
carries "DAYS SINCE LAST INJURY" across a narrow card and a normal-width one truncates it.
Public Sans still sets everything that is a sentence.

## Two buttons

Edit mode and Publish. There was an Enter data, a Publish and a save indicator, and the
save indicator was describing writes that had already happened — every field saves itself
as it is typed. Publish is the only thing that changes state, and it means "this is the
version for the meeting".

The theme is gone. Light is the design, and a dashboard half the plant reads dark is two
dashboards; the one on the wall has to be the one on the desk.

Import, export and print left the foot of the dashboard for Configure. They are not part of
a morning, they are things done to one a few times a month, and a bar of them along the
bottom made a settings screen out of a dashboard. Import still *runs* on the dashboard,
because it writes into the morning being looked at and Configure has no morning — the Data
pane is the door to it rather than a second copy of it.

## Configure is four screens

The shape of the floor, the year's budget, what shipping is judged against, and getting
data in and out. Those are separate subjects with separate audiences, and a single
scrolling page of all four is the settings screen this exists to avoid — so Configure's
rail carries panes the same way the dashboard's carries sections.

## Maintenance is not labour

They were one section in the sense that both were a note. Maintenance is a schedule with a
status. Overtime is a cost the plant is choosing to spend this morning, and the meeting's
question about it is always the same two-part one: which departments, and how many shifts.

That question has no source. `Overtime` in Mississauga_KPIs is per pay period with no
department and no shift breakdown — it answers how much was spent two weeks ago, not what
is running today. So it is typed, one row per department per morning, in **shifts** rather
than hours: shifts are the unit the floor talks in and the one a supervisor can answer
without a timesheet, and the hours turn up in the pay period anyway.

Any overtime at all is amber. Not because overtime is a failure — a plant running Saturday
to hold a delivery is doing the right thing — but because the room has agreed to spend
money and the meeting should say so out loud rather than let it pass in a table.

## Reading the old dashboard's own files

`Daily_Morning_Dashboard_Vr 22.html` can write a day out as JSON, and those files are the
only record of the mornings before MaxMetrics existed. The importer takes them.

It is deliberately loose about shape and strict about reporting. The blob may be one day or
many, keyed by date or dated inside each record; field names are whatever that file called
them. So it flattens whatever arrives, matches each key against every spelling worth
guessing, and — the part that matters — **lists every key it did not recognise**. An
importer that silently drops what it does not understand is one nobody can trust with a
year of history; the preview names the gaps so they can be closed from what it reports
rather than by diffing two screens.

`import_morning` writes to the date on the record, never to the open morning, and every
column is `coalesce(existing, incoming)` — an import fills gaps and can never take a number
a person typed. Running the same file twice therefore changes nothing the second time,
which is what makes it safe to run again when it half-worked the first time.

## Every number on one line

The rule the card layout is built around, and the one that survived none of the earlier
drafts: **every reading in a row starts at the same height.** A card with a flag pushed its
number down, a two-line title pushed it further, and a row of five put five readings at
five heights — which turns reading a row into five separate hunts rather than one sweep.

So the head is a fixed height, the flag occupies its row whether or not there is a flag in
it, and the reading sits directly under both. Cards in a row already shared a height; now
they share the line that matters.

## One surface, one coloured thing

Every card is white. Five washed green, one amber and one red is a page that reads as a
colour chart before it reads as a set of readings, and it made the identity violet on the
shipping cells look like a third verdict.

The verdict lives in the one place it cannot be mistaken for decoration: the number. The
border keeps a whisper of it so a card is still findable across a room, and the flag under
the title is solid with the text knocked out white — that is the one thing on a card which
is news rather than a reading, and outlined it disappeared.

## Present mode is driven by a person

No timer. It rotated every nine seconds with a play button, and a timer moves the screen
while somebody is mid-sentence about what was on it. Arrows, space, and two buttons.

**Only cards reach the wall.** The overlap this replaced was not a sizing bug: the wall was
rendering the whole section — cards, the week table, the review notes, the edit fields —
into a box with `overflow:hidden`, so on Production the table printed on top of the cards.
A wall is not a smaller version of the page. It is the cards, at the size a room reads.

Safety and Quality are two pages because they are two subjects with two owners, and six
quality readings do not fit under two safety ones.

## The number is the reading

The title is how you find a card; the number is why the card exists, so the number is the
larger of the two. An earlier draft had it the other way round — a 22px condensed title
over a two-character streak — and the card read as a label with a footnote.

The unit sits directly under the number, close to it and centred, the way the plant's own
cards set "sheets / hr" under a rate. Inline it competed with the reading for the same line.

A card is the same size whatever section it is in. Safety has two readings, and a
two-column grid drew them a half-page wide each, which is what made the title dominate.
They take the width every other card has and the row centres.

## Things that only break in a browser

Three bugs in a row got past `node --check` and past the conformance rules, and all three
were only visible by driving the pages:

- `drawImport()` deleted in a refactor. Every caller threw on its first line; a throw in a
  click handler is silent.
- `addDays()` called from the dashboard and declared, unexported, in `import.js`.
- `runRequestedAction()` called from the Start block, which sits *above* the import
  section. The module body pauses at Start's `await`, so `importState` had not been
  created yet and every `?do=import` arrival died in the temporal dead zone. It is the last
  line of the file now, which is the only place where both a loaded morning and every
  declaration are true.

The first two are caught by a conformance rule that reduces each module to code — comments,
strings and template text stripped, `${...}` holes kept — and refuses a call to a name the
module never declares. The third is not catchable that way, and neither was the CSS
selector that silently killed half the stylesheet. Those need a browser: load both pages,
click the paths, and assert on what the page actually did. That check lives outside this
repository because it needs Playwright and this repository has no dependencies — which is
a real gap, and the reason it is written down here.

## One card

There is one card in this product. Not one design applied seven ways — one card, one size,
one shape, on the page and on the wall, in every section. Everything below is a consequence
of taking that literally, and each line of it replaced a draft that only looked uniform.

**One width, and the columns fall out of it.** Every earlier attempt fixed the columns per
section — two for safety, three for quality, four for shipping — and every one produced a
different card width per section, which the eye reads as three kinds of card rather than
one kind laid out three ways. So `--card-w` is the fixed thing and every row is `auto-fit`
against it.

**One height per screen, declared rather than discovered.** Letting each row take the
height of what was in it gave quality a 305px row above a 220px row and shipping a 268 above
a 358: six cards plainly the same design and visibly not the same object. On the page
`--card-h` is set to the tallest card that exists — production, which carries a bar, a trend
line and a three-part foot — so nothing is squeezed and the shorter cards spend the
difference on air. Air reads as deliberate; five different heights do not.

**The contents are grown to fill the card.** A proportion cannot know how much a
particular card is carrying — Safety holds a number and a foot, Production holds a bar and a
trend line as well — so sized by proportion alone Safety's contents came to 410px inside a
930px card and sat marooned in five hundred pixels of nothing, with the title stuck at 30px.
`fitCards()` measures what is actually in each card and scales the lot until the fullest card
in the screen has used its room. One factor per screen, never per card: two cards side by
side at different type sizes would be two designs again.

It climbs in coarse steps then finer ones rather than solving for the answer, because the
answer is not linear — a title that wraps to a second line at 41px takes less width and more
height than the same title at 40 — and it never leaves a size that does not fit. A bisection
on a predicate this lumpy converged a tenth low, which is a tenth of the card thrown away. It
goes below 1 as well as above: on a 1366×768 laptop a screen of eight came out two pixels
over, which under `overflow:hidden` is a foot with its descenders shaved off and nothing to
say so.

Three things it has to be careful about, each of which pinned it silently once:

- **The hero's own overflow test is a lie.** A number is set at .95 line-height on purpose,
  so its glyphs are always taller than its line box and `scrollHeight` always exceeds
  `clientHeight`. That read as "this card is full" on every card at every size. The vertical
  test belongs to the title alone; real height overrun shows up in the card's own total.
- **A stretched flex box cannot overflow.** `.hero` reported the same `scrollWidth` as
  `clientWidth` however far its text ran past the border — which is how `$1.42M` got into the
  card next door. It is `width:max-content;max-width:100%` now, so running out of room is
  something the measurement can see.
- **A fact in the foot has a length too.** "Nov 20, 2025" set at the size that suits "39" is
  wider than half a card, and it was the first thing to run out of room on every card — which
  is to say it decided how large the whole card was allowed to be drawn. Each fact carries its
  own character count and is capped by the share of the card its column gets.

**The title is sized by its own length, not by the card's height.** Everything else is a
share of `--u`, which on a two-row screen is set by the card's height — and that drew the
titles on Quality and Shipping at half the size of Safety's, on cards with a whole bar's
width going spare. A title is not competing for the height the reading needs; it is competing
with its own length. So it takes the smaller of a share of the card's width and the width its
characters need, and the bar, the disc and the padding are all multiples of whatever that
comes out as. The cap is **measured, not calculated**: a formula from the character count put
"COQ — month to date" two pixels over and truncated it, because the width a title needs
depends on which letters are in it. And it is one size per screen rather than per card — two
titles of different lengths would draw two bar heights and put their readings on two
different lines, which is the fault the bar exists to remove.

**The title rides in a bar across the top of the card.** Floating it above the number gave
every card a different title position — a flag pushed it up, a longer title pushed it down,
and NCRs Received sat visibly lower than the two cards beside it. A bar is the first thing in
every card and is always the same height, so every title on the page is at the same place and
the same size whatever the card is carrying. It is also what stops a card reading as a column
of text: the heaviest line on it is a shape rather than a sentence. One grey on every card, on
purpose — the verdict lives in the number, and a bar that changed colour with it would be a
second and louder verdict. The pictogram sits in a white disc on the bar, which is what lets
it read as one mark rather than as a picture — and that is what eventually cost the emoji
their place.

Emoji were the right first answer: the plant's own dashboard uses them, the room already
knows them, and they cost nothing. The bar is what killed them. Knocked back to one colour an
emoji is whatever silhouette its designer happened to draw — 🎯 becomes a circle, 📦 a
hexagon, 🪟 a square — and the set stops reading as a set, because it was never drawn as one.
Greyscale rather than a flat knockout keeps enough of the shading to tell them apart, and it
still looked like twenty pictures borrowed from twenty places. They also change shape between
Windows, macOS and Android, so the meeting-room screen and the laptop beside it were showing
different pictures of the same thing.

`ICONS` is a drawn set now: twenty-odd marks on one 24-unit grid, stroke only, one weight,
round ends. That is the whole of why they look like one family at any size. A plant's own
choice of emoji still wins for a department it invented and there is no mark for — but not
for printing, which has one, because a row of four cards should not read as three marks and
a sticker. The bar
is three times the height of the title it holds: twice was enough to read as a bar and not
enough to hold a pictogram at a size a room can see, so the disc had nowhere to sit. The
glyph is centred on both axes rather than left to its line box, because an emoji carries its
own leading and sits a few per cent low — invisible at 25px and not at 100.

Titles are one line, always. Wrapping to two bought a larger title and cost the thing the
title is for: a row where one card wrapped and the next did not put their readings at
different heights. In the bar the title has the whole width of the card rather than the width
inside its padding, and the fit pass grows it until the longest title on the screen fills
that — so it is as large as one line allows, and identical on every card.

On the page the fit is measured across **every** grid at once rather than per section,
because every page card is 318×360 whatever section it is in. Measured per grid, Safety's two
cards grew to a larger title than Production's four on the same screen — the same "two
designs" fault in a new place.

**Everything on the card is measured in the card.** Titles, feet, bullets, sparks and
padding are all a multiple of `--u`, one per cent of the card, so a card and its contents
can only change size together. This is the rule that makes present mode free: the wall is
this card at 653px that the page draws at 318, and nothing needs re-tuning for it. It is
also what makes it checkable — the card fits at one size or it fits at every size.

One per cent of *which* dimension is the whole trick, and three traps sit in it, all found
by measuring:

- **Width alone is not enough.** Plain `cqi` sizes the contents by how wide the card is,
  which means a card can never be wider than its own contents are tall. On a two-row screen
  the card height is fixed at 457px, and that pinned every card to 404px wide and left two
  hundred pixels of the row unused beside each of them — a Quality screen three-quarters as
  wide as the screen it was on. `--u` takes the smaller of the width and the height ÷
  `--card-r`, so the card fills its cell and the contents stop growing when the height runs
  out.
- **A container cannot measure itself.** `cqi` inside the rule that *sizes* the container
  resolves against the next container out — the viewport — so `padding:5.2cqi` came out as
  100px on a 404px card. Padding is in per cent, which resolves against the grid track, and
  `--u` is declared on the card's descendants rather than on the card.
- **A number has a length as well as a size.** 31.5% of the card is right for `262` and
  wrong for `$1.42M`, where six glyphs at that size are wider than the card and ran under
  its own border into the card beside it. The hero carries a `--chars` count and takes the
  smaller of the two caps.

**Nothing is bumped for one view.** Solo view used to give a card a larger title, a larger
icon, a larger number and more padding — four changes that made one card two cards
depending on which link you had clicked. The larger title in the same box is what cut "Days
since last injury" down to "…last inj".

**Everything is a card, including the money.** Financials was one wide panel holding two
panes — the only thing in the product that was not a card, three times its neighbours' width
on the page and the full width of the screen on the wall, between a Shipping screen of eight
cards and a Maintenance screen of none. Month to date and year to date are two readings
against two targets, which is what a card is for. Labour's single card in a bespoke
two-column grid and Maintenance's tables-only section were the same mistake in the other
direction, and are two cards each now.

**The foot is one row, however many facts are in it.** Two meant two columns and three meant
a second row, so a production card spent a whole line on "HOURS 8.5 h". It divides by what
it holds; one fact reads as a sentence — "Target 0" — rather than as a lonely column.

## What the week table is for

It reports **last week's productivity against the standing targets**, and nothing else. It
used to run today's rate, today's uptime and today's make-ready beside the previous week's,
each with a seven-day movement — four comparisons per department, three of which are on the
card directly above it. What is left is the one thing the card cannot say: what the same
weekday produced, and how that sat against target.

## A wall is the page's card, larger

Three levers got this wrong before it got it right, and all three are worth writing down,
because each produced a wall that looked plausible in a screenshot and wrong in the room.

`min-height` on the card broke every two-row page: quality's six and shipping's eight do not
fit two rows of 42vh plus a heading in 1080, so the rows compressed and the cards clipped
their own feet under `overflow:hidden` — silently, which is the worst way for a wall to be
wrong.

`grid-auto-rows: minmax(min-content, 1fr)` fixed the clipping and introduced a worse
problem. `1fr` rows share out the whole screen, so a one-row page got a card 940px tall and
a two-row page got cards half that: three different card shapes across a five-screen walk,
and safety's reading marooned in the middle of a shape that exists nowhere else in the
product. A presentation does not distort the thing it is showing.

A **single size for every screen** was the third. It fixed the shape and shrank everything:
eight shipping cards in two rows set the size for the whole walk, so Safety's two then sat
at that size in the middle of a screen three-quarters empty — the number smaller than it had
been before any of this started. One size across screens is not the same goal as one card,
and chasing it cost the thing the wall is for.

The right answer is **sized per screen, arranged on purpose**. The group stays together —
Shipping is one screen, not two — and `bestGrid()` in `dashboard.js` costs every column
count at the size it would actually produce and takes the best, with a squared penalty for
cells left empty in the last row. Eight comes out four and four. Six comes out three and
three. Four comes out four across, because one row of four draws a bigger number than two
rows of two. It has to be arithmetic rather than a rule of thumb, because the answer moves
with the screen.

What it maximises is **how big the reading comes out**, not how much card there is. Those
are different: two rows of three and three rows of two both cover most of the screen, and
one of them draws the number at half the size.

At 1920×1080 that gives Safety 653×930 with a 184px number, Quality 608×457, Shipping
452×457 four and four, Production 452×723. Between the largest screen and the smallest the
card varies by about half — variation the eye reads as the same card at two sizes rather
than as two designs — and every screen fills the height it is given. Three constants bound
it, and both the stylesheet and `bestGrid()` read them from the same place, because an
arrangement chosen for a card that is not the card drawn is worse than no arrangement:
`--card-r` (the ratio at which contents exactly fill a card), `--card-r-max` (the tallest a
card may be drawn before it reads as a column) and `--wall-cap` (the widest, so a screen of
two does not draw a card like a door). `--wall-chrome` was the fourth and lived on
`body.tv`, where `bestGrid()` could not see it — so it read zero, thought it had the whole
1080, and laid Production out as two rows of two.

One more thing had to go with it: an empty grid still occupies a row. Production keeps a
second grid for its review notes and Labour wraps its table in one, and both empty out up
here — but each was still `flex:1` with a row the height of a card, so the real cards sat a
hundred and thirty pixels above centre. Safety looked centred and Labour did not, on the
same rule. A grid with no visible card is now hidden outright.

## Three zones, and the line at the bottom of the card

A card's body has three zones and none of them depends on what the others hold.

Two earlier drafts did not. Centred, the whole block floated in the middle of a card with
room to spare. Spread evenly, the parts landed wherever the *count* of parts put them: a card
carrying a bar and a line put its number a third of the way down, the card beside it with
neither put its number in the middle, and the rule above the foot came out at four different
heights across one screen. The room's words for it were "there are, like, three or four
different types".

- **The reading** starts at the same line on every card, always: a fixed inset below the
  title bar, measured as a share of the card so it is the same line at 318px and at 870.
- **The drawings** — the bar against target and the seven-day line — drop to the floor of
  what is left. That is also why the graphs are twice as easy to read as they were: pinned
  under the number, a line sat halfway up a card with two hundred pixels of nothing beneath
  it.
- **The foot** is a fixed-height strip at the bottom. A card with nothing to put there
  reserves the same strip and simply does not draw the rule.

Two attempts at the reading's line were wrong in opposite directions before this. Flush
under the bar read as though the number had been shoved up against the title with all the
card's air pooled beneath it. And centring the cards that had nothing under them — Safety's
two, and the complaint counters before they had a chart — broke the only rule that matters:
NCRs sat in the middle of its card while the COQ card beside it sat at the top. The answer
to a card with nothing under its number is to give it something, not to move the number.

The flag line is reserved across the whole group rather than per grid, for the same reason.
Per grid, a Safety section carrying "Record broken" reserved the row and no other section
did, so every number in Safety started twenty pixels below every other number on the page.
The group is one screen on the wall and the whole page on the page, which is exactly the set
of cards a reader takes in at once.

Three things had to be nailed down before the rule would actually land on the same line.

The **foot's height** is measured in `--cu`, the card's own hundredth, *before* `fitCards()`
has had its say — not in `--u`, which carries the fit factor. `--fit` is found per screen from
whatever the fullest card on it needs, so a Safety screen of two sparse cards settles at 1.96
and a Shipping screen of eight at 0.95; a foot tied to that drew two different feet and put
the two sections' rules at two heights. The foot is not competing for the room the reading
needs. It is a fixed strip, the same strip on every card of the same size.

The **two lines inside a fact** have fixed line boxes. Each fact caps its own type by how
long it is — that is what stops "Nov 20, 2025" running off a card — but a smaller value means
a shorter line box, so two cards side by side finished their feet a few pixels apart. Fixing
the boxes keeps the caps doing their job and takes the side effect away.

And a foot holding **one fact** keeps the same two-line shape as one holding four. It used to
read as a sentence on a single line, which is nicer on its own and put Shortage count's rule
below the COQ card's beside it.

`fitCards()` cannot measure a card while the middle zone is stretching — every card fills its
own height exactly, so nothing ever looks full and the climb has nothing to push against. It
adds a `measuring` class for the duration, which puts the parts back in a plain stack. What
has to fit is the stack; the stretch is only what to do with what is left over.

The flag row is the other half of the top gap, and it was invisible. The flag row — where "RECORD BROKEN" goes — was
reserved on every card so that a card with a flag and a card without one start their readings
on the same line. True, and worth keeping; but reserved *unconditionally* it was thirty pixels
of nothing at the top of every card on Quality, Shipping and Financials, none of which ever
carries a flag. `fitCards()` puts a class on the grid when something on that screen is
actually flagged, and only then is the row held open.

## A year of months, for the counts that are closed monthly

The seven-day line is the right picture for a reading taken every morning and the wrong one
for a count closed off at month end. NCRs, internal complaints and customer complaints are
the second kind: a week of them is four zeroes and a one, drawn as a spike that means
nothing — and it left those three cards with nothing along their bottom while every card
beside them carried a bar and a line, which is what pulled their numbers out of line with
the rest of the screen.

Twelve columns answer the question actually asked of these three: is this a bad month or a
bad year. The month being read is drawn solid and the ones behind it are washed. A month
with no incidents draws a stub, because an empty slot and a month that has not happened yet
would otherwise look identical; months past the one being read are left out entirely, since
drawing December in August is a promise the data cannot keep.

The series comes from the running month-to-date column rather than from a monthly table
there is no reason to keep — every morning of a month carries that month's count so far, so
the month's total is the largest one written in it.

`columns()` is the one chart drawn in HTML rather than as an SVG. The line and the bar are
stretched to the card's width with `preserveAspectRatio:none`, which is right for a shape
and wrong for a letter: at a 120-wide viewBox in a 600px card, a month initial comes out
five times as wide as it is tall.

## One word for variance

Four sections were each inventing their own. Shipping printed `−0.13 pts`, cost of quality
`+0.04 pts`, money `▲ 2.3%`, and a department a bare `−50`. Asked what "pts" meant, nobody in
the room was sure whether it was a percentage of the target or a percentage of a percentage —
and "fifty off" is a different miss on three thousand than it is on two thousand.

Every variance on the product is now the same thing: **how far off target, as a share of the
target, in a chip the colour of the verdict**. Over is green, under is red, and a little under
is amber — four per cent is the line, because a miss inside four per cent of budget is a week
of weather and past it is a decision. `varianceChip()` in `readings.js` is the only thing that
draws one, and `lowerIsBetter` flips which side is green without flipping the sign printed:
cost of quality at half its target reads `−55.3%` in green. The number says which way it
moved; the colour says whether that was the way to move.

It appears **once** per card. Where the foot has a slot for it — the shipping percentages,
both COQ cards — that is where it goes, under the rule with the target beside it. Where the
foot is full, it rides at the right of the bar's label row instead.

## Safety has no bar

Two drafts drew the streak against the record: first as a target to reach, then as a marker to
run past. Both were wrong for the same reason. The plant is not trying to beat this record.
Safety has one target and it is zero — zero injuries, zero near-misses — and a bar filling a
little further every morning turns "eighty-nine days clean" into a race against a number the
room would rather never think about again. The record belongs where it is: a fact under the
rule.

Where target *is* drawn, it is drawn loudly. The marker was a three-pixel line at
three-quarter opacity over a washed band, which ten metres from a screen is not there at all.
It runs the full height of the bar at full ink now, with a shoulder of card colour on each
side so it reads against green, amber and red alike, and a notch pointing at itself.

## One left edge on the page, centred on the wall

The page scrolls and the wall does not, and that is the whole reason they align differently.

Centred, a row of two Safety cards began in the middle of a 1600px screen and a row of eight
Shipping cards began at the edge, so scrolling from one section to the next shifted the whole
page sideways. One left edge for every row — and for the section headings above them, which
used to be centred between two rules and now sit against a rule that runs to the right — is
what makes a scroll read as one page rather than as seven.

A presentation is the opposite case: one screen at a time, nothing to scan down, and a block
of cards pinned left with a third of the screen empty beside it looks like a mistake. So
`justify-content:center` survives, but only under `body.tv`.

Tables under a section stop at 1080px rather than running the width of the screen. Nine
columns of last week's productivity stretched across 1600 put "Printing" at one edge and its
make-ready target at the other, which is a long way to carry your eye for numbers the cards
above already summarise.

## Today, then the month, then the year

NCRs, internal complaints and customer complaints were year-to-date counts and nothing
else. That answers "how are we doing" and not the question a morning meeting asks. A count
of 94 does not change between Tuesday and Wednesday, so the card said the same thing every
morning and the room stopped looking at it.

The reading is **the last twenty-four hours**; the month and the year are the context under
the rule, which is the shape Safety already uses for its record and its last incident. Nought
is a reading, not a blank — a morning with no NCR raised is exactly the morning worth
printing a zero on.

Both counts come from the raw logs rather than the monthly roll-up, because only the logs
carry a date per record: one row per NCR, one per customer complaint. Counting rows gives
today and the month to date in the same pass.

`carry_forward` carries the running totals and the standing targets to the next morning. It
does **not** carry the daily counts, and that omission is the point: carried forward,
yesterday's one NCR would still read as one this morning, and a card reporting a stale
incident is worse than one reporting none.

## import_morning reads the table, not a list

`import_morning` named its columns one by one. Every column added to `daily_metrics` after
it was written was therefore dropped on the way in, silently — the file imported cleanly, the
run said "written", and the card stayed blank. Ten columns had accumulated behind it:
`ncr_ytd`, both complaint totals, all six of the today/month-to-date counters, and both
financial figures. That is most of what the room reported as "the numbers are not coming
through", and none of it showed up as an error anywhere.

It reads `information_schema` now and builds the update from the columns the file actually
mentions. A column the parser learns to fill is written the morning it is added; a key the
file carries that is not a column is ignored rather than raising. The rule that matters is
unchanged and is the reason the assignment is generated rather than written: every one is a
`coalesce`, so a reading somebody typed is never replaced by a file. Departments work the
same way.

## What the DOR's own Formulas tab settles

Uptime, make-ready and the make-ready count were read out of the DOR and deliberately not
imported, because run-hours over crewed-hours gave printing 68% on a day the plant had
recorded near a hundred, and a wrong number that arrives by itself is one nobody thinks to
check.

The definition was in the workbook the whole time. DOR V9 carries a `Formulas` tab:

```
Uptime      = (MR Hrs + Run Hrs) / Crewed Hours
Avg MR Time = MR Hrs / # of MR's
```

Setting a machine up is not downtime — it is the machine being worked on by the crew it is
crewed for, which is the whole reason make-ready carries a target of its own. Counting the
make-ready hours puts all three departments between 75% and 95% on every day in the file,
and 5 August prints 0.95 h over 5 make-readies, which is the plant's own stored figure to
the digit. It is clamped at 100: a shift logging more make-ready and run than it was crewed
for is a timesheet to fix, not a machine that ran 124% of the time.

Output and crewed hours were never in doubt and reproduce exactly, so the sheet was being
read correctly all along. What was missing was one tab nobody had opened.

## Where quality comes from

Quality is not counted every morning. NCRs, customer complaints and the cost of poor quality
are closed off month by month in one sheet the quality manager keeps — a row per month with
the plant's own arithmetic already done. `readKpi()` reads that sheet and writes the row for
the month the morning falls in, because a month-to-date figure is true of the morning you
read it on. The same row carries shipped dollars and OTIF, so one workbook fills the Quality
cards, both Financials cards and the two OTIF cards.

Three things about it are worth writing down:

- **Its month column is written by hand.** The same column says JAN and Jan and March and
  Mar. Three letters, lowercased, is all that survives that.
- **Columns are found by their letters, not their position.** The headers carry line breaks,
  double spaces and trailing blanks, and a column inserted on the left must not silently
  shift every reading one place.
- **A month it has not closed off yet reads the last one it has, and says so in a note.**
  Silently reporting a different month than the one asked for is the failure this whole
  section exists to prevent.

Year to date is summed across the months up to and including that one, rather than taken
from a total row, so it is right on the eighteenth of March as well as on the thirty-first.

## The half-import

An export came in with safety and shipping filled and quality, financials and production
empty. It reported success and listed nothing as unrecognised, which is the worst way for an
importer to be wrong: nobody goes looking for the readings that are missing when the ones
they checked are right.

The walk that finds records stopped at the first object carrying a date and treated *that* as
the record. An export laid out as `{safety: {date, …}, shipping: {date, …}, quality: {…}}`
therefore kept the two sections that happened to be dated and dropped the ones that were not.
Three things fix it, and the third is the one that matters:

- A date found higher up is passed down, so sections inside a dated record belong to it.
- Records sharing a date are one morning, not several.
- **When every date in the file is the same date, the whole file is the record.** The
  question of which object is "the record" does not arise for a one-morning export, so it
  is read from the root and the undated sections come with it.

A list of rows was the other half of it. An array fell straight through to the scalar
branch and was filed as one unreadable key, so `departments: [{name: "Printing", qty: …,
hours: …}, …]` — which is how most exports write "the departments" — lost every department
in the plant and said "departments" once in the not-recognised list. A row that names its
department is that department's numbers now; a row that does not is walked like any other
object.

And the preview says which sections a file will fill **before** it is accepted, in the
language of the dashboard rather than the language of the file. A list of unrecognised keys
is the truth but it is not the answer: the question somebody is asking after an import is
"did Production come in", and a section with nothing coming is what a silent half-import
looks like when it stops being silent.

Two smaller ones fell out of testing it. `shipping` is both a department and a section of the
morning, and an export that grouped late, shorts and OTIF under it had all four swallowed as
unreadable department fields — a department-named object is only a department if half its
keys are department fields. And a streak written as "6 days" rather than as a date was being
dropped entirely, when the count and the record's own date are enough to work the date out.

`scripts/check-import.mjs` runs the five shapes an export has actually arrived in and fails
if any of them loses a reading. It runs before every publish. The conformance rules cannot
catch this class of bug and neither can `node --check`; only reading a file and counting what
came out can.

## Importing a year

The old dashboard writes one JSON file per morning, and a plant has a folder per month of
them. So the importer takes any number of files at once, a folder, or a folder of folders —
a dropped directory arrives as an entry rather than as its files and is walked to any
depth, because asking somebody to open twelve monthly folders is asking them not to bother.

Anything that is not `.xlsx` or `.json` is ignored rather than reported: a year of folders
contains other things, and a list of every one of them is not a useful error.

Each morning still goes to the date on its own record through `import_morning`, and still
never replaces a reading somebody entered. Thirty files across two folders, verified end to
end: thirty mornings, thirty distinct dates, nothing else touched.

## How the files get here

The morning's numbers live in five or six spreadsheets in different places, and somebody
dropping them into the Import screen every day is a job nobody keeps doing. So there is one
endpoint, `supabase/functions/ingest`, and the question of *how a file reaches it* is
deliberately not that endpoint's business. A flow, a scheduled script and a person with
`curl` all look the same to it.

The endpoint imports `js/import.js` and `js/xlsx.js` **unchanged**. That is the whole point
of it. A second parser written for the server would drift from the one the preview screen
shows, and then the number the room accepted on Tuesday and the number the flow wrote on
Wednesday would have come from different code. Both modules already use nothing but web
standards — `TextDecoder`, `Blob`, `DecompressionStream`, `Response` — so they run in Deno
with nothing ported; this was checked by running the browser parser in bare Node against a
real workbook before any of this was built. Deno bundles from the function folder down and
cannot reach `js/`, so the two files are copied to `_shared/` by `scripts/sync-shared.mjs`
and conformance fails if the copy ever stops matching.

Three transports were possible. The scheduled PC won:

| | Reaches | Needs |
|---|---|---|
| Power Automate | SharePoint and OneDrive | the HTTP action, which is premium in most tenants |
| Microsoft Graph on a schedule | SharePoint and OneDrive | an Entra app registration and admin consent for `Files.Read.All` |
| A scheduled task on a plant PC | **everything that PC can open** | nothing |

The deciding fact is the Z: drive. It is an on-premises file share, and neither Microsoft
365 option can see it at all without a data gateway — so either way a machine inside the
building has to be involved. Once one is, it can read the OneDrive folders too, because
they are synced to that same machine as ordinary files. One mechanism instead of two, and
no permission to ask anybody for. `tools/hotfolder/` is that mechanism.

It is a pull on a timer rather than a watcher on a change. A watcher fires several times
while somebody saves a workbook, and fires at 11pm; the numbers are wanted once, before the
morning meeting. The state file hashes contents rather than trusting timestamps, because
OneDrive rewrites `LastWriteTime` when a file re-syncs unchanged.

Writes go through `import_morning` like every other import, so the two rules that make a
bulk load safe hold here too: the day is created if missing, and a reading somebody typed
is never replaced. A flow that fires twice writes the same morning twice and changes
nothing the second time.

The endpoint authenticates with a shared secret in `x-maxmetrics-key`, compared in full
rather than short-circuiting, because the caller is a flow and not a person — there is no
sign-in to attach it to. Without `MAXMETRICS_INGEST_KEY` set in the project's environment
the function refuses everything, which is the correct state for it to be deployed in until
somebody is actually sending files.

## Deployment

GitHub Pages, from the `gh-pages` branch, at `maxsolutionsmiss.github.io/MaxMetrics/` —
public URL, protected by sign-in. `scripts/publish.sh` runs the conformance rules, the
import shapes and a parse check, builds `_site/`, and pushes it.

Netlify used to serve the same branch alongside Pages, and was dropped when its credit ran
out. It cost nothing to leave: nothing in the repository was ever Netlify's — no
`netlify.toml`, no `_redirects`, no build command of theirs — because the branch already
held a finished site rather than something to be built. The switch was a sentence in this
file and the wording in `publish.sh`.

Two things make a host swap that cheap, and both are worth keeping:

- **Every path in the site is relative.** Pages serves a project site under `/MaxMetrics/`
  and Netlify served it at the root; a single `href="/assets/…"` anywhere would have broken
  on one of them. `../assets/…` works on both, and on a file opened off a USB stick.
- **`.nojekyll` is written into every build.** Pages runs Jekyll over a branch unless told
  not to, and Jekyll drops every file whose name starts with an underscore.

One thing does not travel with the branch and has to be checked on the host: Supabase's
**Site URL and redirect allow-list**. Sign-in works from any origin, but the link in a
password-reset email is built from that setting, so a stale host there sends people to a
domain that no longer answers.

Assets are stamped with the commit at build time, including import specifiers — versioning
the `<script>` tag alone would leave every module it imports cached, and a reload would show
the previous release. The stamping is applied to the copy, never to the source, so the paths
in the repository stay clean.

It was a GitHub Actions workflow. The organisation has no runners, so the workflow never
ran, which meant the checks in it never ran either and a deploy depended on nobody noticing
that a queued job was queued forever. A script on the machine of whoever is publishing is
slower to type and honest about when it happened.
