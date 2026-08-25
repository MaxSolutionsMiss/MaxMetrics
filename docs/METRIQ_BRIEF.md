# Metriq — a briefing package

*A plain-language description of a working system, written so a second opinion can be formed
from it without seeing the code. Prepared 11 August 2026.*

---

## 1. What it replaces

Velari is a folding-carton manufacturer. Its Toronto plant runs a stand-up
production meeting every weekday morning, in front of a screen, lasting two or three minutes.
Until now that meeting read from **a single HTML file — "Daily Morning Dashboard v22"** — kept
on a network share and edited by hand each morning by one person, who copied numbers out of
several spreadsheets into it.

The plant has nine sites (Toronto, New Jersey, Nashville, Springfield, Chicago, 
Sturgis). Only Toronto is live so far.

**Metriq** replaces that file. It is a web app that assembles the same morning from a
database, lets several people fill in the parts they own, and shows it three ways: as a page
you scroll, as a walk of full-screen slides for the meeting, and as a single fixed screen for
a TV.

---

## 2. What a "morning" contains

One row per plant per day, plus child rows. Roughly fifty values.

| Group | Readings |
|---|---|
| **Safety** | days since last injury, days since near-miss, and the record for each |
| **Quality** | jobs short today; cost of quality month-to-date and year-to-date against a 0.85% target; NCRs, internal complaints and customer complaints — each as *today*, *month to date* and *year to date* |
| **Production** | per department (Printing, Die Cutting, Gluing, and any the plant adds): output, crewed hours, the rate that falls out of them, uptime, average make-ready, and the same figures for the same weekday a week ago |
| **Shipping** | jobs shipped, of those on time, late, short, cartons; OTD and OTIF derived from those; OTIF month-to-date and year-to-date |
| **Financials** | sales month-to-date and year-to-date against a monthly budget, prorated by elapsed days |
| **Maintenance** | upcoming items: department, machine, hours, what for, when, status |
| **Labour** | overtime shifts per department, and which machines are running them |
| **Words** | a status and a note per department for the last 24 hours; a staffing note; a maintenance note |

---

## 3. Where the numbers come from

Three spreadsheets the plant already keeps. Roughly **forty-three of the fifty values** exist
in one of them; the rest are things no file can know.

| Source | What it fills | Notes |
|---|---|---|
| **DOR V9.xlsx** (`Y:\QC Dept`) | all of Production | 11 MB, 18 tabs, one row per machine per shift since 2013. Three tabs are read: Printing Data, Die Cutting Data, Gluing Data. Its own `Formulas` tab defines the plant's arithmetic: `NNN Speed = Net Imps / Crewed Hours`, `Uptime = (MR Hrs + Run Hrs) / Crewed Hours`, `Avg MR Time = MR Hrs / # of MR's` |
| **Toronto_Monthly KPI Raw Data.xlsx** (OneDrive) | cost of quality, NCR and complaint counts, sales, OTIF roll-ups | A monthly roll-up sheet plus two raw logs, one row per NCR and one per customer complaint, each dated |
| **OTIF sheet** (OneDrive) | jobs, on time, late, short | Parser written; not yet run against the real file |

**Left to a person:** two safety dates, jobs short, cartons, overtime shifts and machines,
maintenance items, and the words.

### Rules the ingestion follows

- **A file never overwrites a person.** Every write is a `coalesce`: if a value is already
  there, the file leaves it alone.
- **Silence is a failure, not a success.** A file that yields nothing is an error and a red
  log line, not a number that quietly stops moving. This is the failure mode the whole system
  exists to prevent — the old dashboard's worst behaviour was a stale figure nobody noticed.
- **A count past the end of a log is unknown, not nought.** If the NCR log's last row is 27
  July and the morning being read is 11 August, August's count is left empty and the card says
  "not logged this far yet". Writing nought would claim no NCRs were raised, which is a
  different statement.
- **Derived values are derived, never stored twice.** OTD and OTIF follow from jobs, late and
  short, so the percentages can never contradict the counts printed beside them.

---

## 4. How the technology is put together

Deliberately small. No build step, no framework, no bundler.

```
index.html            sign-in
app/dashboard.html    the morning — all four surfaces
app/departments.html  Configure: departments, machines, targets, budgets, which cards
assets/metriq.css ONE stylesheet
js/db.js              ONE network module (Supabase client, retries, error wording)
js/readings.js        judgement (band) + every drawing + the card components
js/assess.js          turns a morning into a list of findings
js/import.js          the spreadsheet parsers
js/xlsx.js            a small XLSX reader (streaming, reads only the sheets it needs)
js/pages/*.js         page controllers
supabase/functions/ingest    an endpoint the hot-folder watcher posts files to
tools/hotfolder/*.ps1        a Windows scheduled task that posts the files at 5:30am
scripts/verify-metriq.mjs  the architecture rules, checked rather than remembered
```

- **Postgres on Supabase**, row-level security per plant. The publishable key ships in the
  page and grants nothing on its own.
- **Hosting is GitHub Pages** from a `gh-pages` branch. There is no CI — the organisation has
  no runners — so `scripts/publish.sh` runs the checks locally and pushes the built site.
- **`scripts/verify-metriq.mjs`** enforces the architecture: one stylesheet, one network
  module, no build tooling, no `!important` outside a listed set of exceptions, no threshold
  defined outside `band()`, no call to a function that is never declared or imported, and the
  edge function's copy of the parser must be byte-identical to the browser's.

### Two ideas the code is built around

**One definition of a card.** `metricCard()` in `readings.js` draws every reading on the
product. The page, the meeting walk and the TV snapshot all render the same function; the wall
is literally the page's card, larger. Nothing is styled per screen.

**Everything on a card is a share of the card.** A custom property `--u` is one per cent of
the card, and every length — type, bars, padding, the foot — is a multiple of it. A second
factor `--fit` is *measured* per screen by growing the cards until the fullest one runs out of
room. So a card at 318px and the same card at 870px are the same design, and adding a
department reflows the whole screen correctly without anybody re-tuning anything.

---

## 5. The four surfaces

| | Who | Where | What it refuses |
|---|---|---|---|
| **Enter** | one or more people, 6–7:30am | a laptop | charts, verdict colour, anything not being typed |
| **Everything / sections** | anybody, any time | a laptop or phone | edit controls it does not need |
| **Present — one at a time** | the meeting, 8am | a big screen, driven by a person | anything unreadable in four seconds |
| **Present — one page** | a corridor TV, a screenshot | a fixed screen, nobody driving | scrolling, paging, navigation |

**Enter** is one screen with no charts. Four assigned columns of grouped fields — people and
quality, the floor, what left the building, then what the room has to say about it — with the
maintenance list full width underneath. Every value a file already filled is shown greyed with
the file named beside it: correctable, but not chased. The counter at the top counts only what
no file can know — on Toronto's numbers, about two boxes and a sentence.

**Present, one page** is one grid of identical cards — same size, same type scale — with the
sections told apart by the colour of the bar and a legend. It fits exactly one screen at 1366,
1920 and 2560. Cards shed detail as they shrink: under 250px tall they drop the seven-day
line, under 200px the whole track, under 150px the foot. Which sections and which cards go on
it is a separate switch from which cards the plant carries, because a corridor TV is a
different audience from the laptop somebody opened.

**Cards can be dragged into the order a plant wants**, on any surface, and the order is stored
against the location rather than the browser — so the room is still looking at one thing.

---

## 6. Design rules that have been argued out

These are settled decisions, each of which cost at least one round of rework:

1. **Groups stay whole on the wall.** Shipping's eight cards are one screen, never two, and
   never five above three. The arrangement is chosen to maximise how big the *reading* comes
   out, with a squared penalty for a ragged last row.
2. **Every card's rule sits on the same line.** The foot is a fixed-height strip measured
   against the card rather than against the fit factor, with fixed line boxes inside it.
3. **The reading starts at the same line on every card** — a fixed inset, not centred, not
   flush.
4. **Variance is one thing everywhere**: how far off target as a share of it, with an arrow, a
   sign and a percentage, in a chip coloured over/under (green, amber inside four per cent,
   red past it).
5. **Safety has no bar.** Its target is zero and the record is not a finish line.
6. **Fields are edited where the number is printed**, never in a block underneath.
7. **Colour is the verdict.** Green, amber and red mean good, warning and stop, and are never
   spent on decoration or on labelling a category.
8. **Four kinds of number, four drawings**: a count, a rate, a share, a streak.
9. **The title bar is the same height on every screen of the product.** It is sized against
   every title the catalogue can draw, not against the longest one currently visible, or
   walking from Safety to Production moves every title on the page.
10. **Colour tells you the family only on the one-page collage**, where there are no headings
    to do it. Seven hues at one darkness, none of them the green, the amber or the red.
11. **Nothing but cards reaches a screen.** Two tables used to earn an exception; both are
    list cards now, and a note card with nothing in it is dropped from the wall entirely.

---

## 7. What is not built yet

- The ingest endpoint and the Windows watcher are written and tested but **not deployed**.
  Every number in the database today was put there by hand.
- The OTIF parser has never seen the real file.
- Machine-level uptime and make-ready targets for 2026 exist for printing only.
- There is no read-only public link and no JSON/CSV feed, so nothing can reach Power BI.
- The morning has no lifecycle beyond draft/published: no "agreed", no attribution per value,
  no actions coming out of the meeting.
- No per-card chart choice; every card is currently a number, a bar and a line. The bar, ring
  and gauge drawings exist and nothing offers them.
- **"What to line up" is rules, not a model.** It ranks what the morning implies somebody
  should do — overdue maintenance, machines about to go down, departments under target,
  overtime already booked, what a manager flagged — from state the page already holds. There
  is no language model anywhere in the product, and adding one would mean an edge function and
  a key, because nothing here has a server.

---

## 8. Questions worth a second opinion

The author of this system would ask a reviewer to push on:

- **Is a daily record the right central object**, or should this be a stream of readings with
  the "morning" as a view over it?
- **Ownership.** Should each block have a named owner, so the screen can say "waiting on
  Shipping" fifteen minutes before the meeting?
- **Should the meeting produce actions** — an exception becoming an owned, dated item that
  appears on tomorrow's screen — or is that a different product?
- **Is the four-surface split right**, or is one adaptive surface with density as a setting a
  better idea?
- **Provenance.** Is "every value knows its source, who and when" worth the schema cost?
- **Is the no-build-step constraint** (one stylesheet, one network module, plain ES modules)
  helping or is it now costing more than a small toolchain would?
- **How much arrangement should a plant own?** Cards can now be reordered and switched off per
  surface. Is that the right amount of rope, or does a dashboard nine plants can each rearrange
  stop being one dashboard?
- **Would an LLM earn its place here**, and if so where — writing the morning's summary,
  ranking what needs attention, or reading the free-text notes for patterns across weeks?
