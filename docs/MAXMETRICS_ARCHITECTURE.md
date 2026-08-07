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

Present mode is fitted to 1920×1080 and verified to fit with no scrollbar. Type is pegged
to viewport breakpoints so one page fills a laptop and a 48" screen.

**A card is as tall as what it has to say.** An earlier version stretched each section to
the viewport and the cards with it, so three lines of a review note sat at the top of a
four-hundred-pixel card and the rest was empty ground. Filling a screen is not the same as
using it: an inflated card reads as one with something missing. Rows now end where their
cards end and the leftover space stays empty. The meeting-room TV is the single exception,
and even there the row is centred in the space rather than stretched to fill it.

Within a row cards do still share a height — that part was right, because a ragged row of
readings looks like a fault. What follows from it is that their contents must be
top-anchored: printing carries five foot stats and gluing four, and centring the middle put
each department's rate at a different height, which turns reading three numbers into three
separate hunts. Card titles get two lines of room whether they need them or not, for the
same reason.

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

## One size, one shape

Two rules that took several drafts to find, and both are about a page being one page:

**Every card title is the same size.** It was derived from the card's width in `cqi`, so a
narrow safety card and a wide production card drew their titles differently and the eye
read two kinds of card. It is a fixed size now, and the grids are sized to fit it.

**A card is the same width in every section.** Safety has two readings and Quality has six;
a two-column grid gave safety's three times the width. Safety's row is six tracks with each
card spanning two, starting one track in — the cards come out exactly a three-across width
and the row sits centred. Shipping is the deliberate exception at four across, because eight
readings in two rows of four is what the plant asked for.

**The foot is one row, however many facts are in it.** Two meant two columns and three meant
a second row, so a production card spent a whole line on "HOURS 8.5 h". It divides by what
it holds; one fact reads as a sentence — "Target 0" — rather than as a lonely column.

## What the week table is for

It reports **last week's productivity against the standing targets**, and nothing else. It
used to run today's rate, today's uptime and today's make-ready beside the previous week's,
each with a seven-day movement — four comparisons per department, three of which are on the
card directly above it. What is left is the one thing the card cannot say: what the same
weekday produced, and how that sat against target.

## A wall is rows, not a page scaled up

Two levers got this wrong before it got it right, and both are worth writing down.

`min-height` on the card was the wrong one. It made a two-card page fill the screen and
broke every page with two rows: quality's six and shipping's eight do not fit two rows of
42vh plus a heading in 1080, so the rows compressed and the cards clipped their own feet
under `overflow:hidden` — silently, which is the worst way for a wall to be wrong.

`grid-auto-rows: minmax(min-content, 1fr)` is the right one, and it says the opposite per
row: never shorter than what is in it, and share whatever is left. One row of two fills the
screen; two rows of four take half each. The densest page — eight cards — is what sets the
padding, and it is checked by measuring the lowest card's bottom against the viewport
rather than by looking.

On a page a card's foot is pinned to the bottom so a row lines up whatever each card
carries. On a wall the card is a thousand pixels tall and that leaves a hole between the
number and its context, so there the contents travel together and centre.

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
