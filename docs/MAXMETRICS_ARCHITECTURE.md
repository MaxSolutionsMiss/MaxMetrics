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

This is also what makes the chart style a free choice. The four drawings — number, bar,
ring, gauge — receive a verdict already reached. Swapping one for another changes the
shape and cannot change the answer.

## One style for every card

The chart style is one setting for the whole dashboard, not one per card. A screen of
mixed bars, rings and gauges cannot be compared across, and comparison is the only reason
to draw a number as a shape rather than print it.

The style belongs to the reader, stored on their profile. One person preferring rings must
not change what anyone else sees on their own screen or on the TV.

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

**The title takes two lines, and the head reserves both.** One line capped the title at
whatever "Days since last injury" happened to fit in — twenty-two characters wide, so on a
653px card it could not grow past 30px however much room was going spare. Reserving both
lines on every card is what keeps the readings in a row on one line; a card that wraps beside
a card that does not would start them at different heights.

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

Netlify, from the `gh-pages` branch, public URL, protected by sign-in. `scripts/publish.sh`
runs the conformance rules and a parse check, builds `_site/`, and pushes it.

Assets are stamped with the commit at build time, including import specifiers — versioning
the `<script>` tag alone would leave every module it imports cached, and a reload would show
the previous release. The stamping is applied to the copy, never to the source, so the paths
in the repository stay clean.

It was a GitHub Actions workflow. The organisation has no runners, so the workflow never
ran, which meant the checks in it never ran either and a deploy depended on nobody noticing
that a queued job was queued forever. A script on the machine of whoever is publishing is
slower to type and honest about when it happened.
