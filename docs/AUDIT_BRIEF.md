# Metriq — brief for an outside review

Paste this whole file into ChatGPT, Claude, Gemini or Perplexity and ask for the review at
the end. It is written to be self-contained: an assistant that has never seen the codebase
should be able to give useful, specific answers from it alone. Where a question needs the
code, the file to paste alongside is named.

The live site is <https://velari-sys.github.io/metriq/>. The source is
<https://github.com/Velari-sys/metriq>. Both may be private to you; if the
assistant cannot reach them, everything it needs is below.

---

## 1. What the plant does, and what this replaces

Velari runs folding-carton plants — they print, die-cut and glue paperboard into
cartons. Nine sites; **Toronto is the only one live** on this product, and the rest are
meant to come on with no code changes, only configuration.

Every weekday at about 07:45 the Toronto management team holds a **morning meeting**.
Ten to fifteen people — plant manager, quality, scheduling, shipping, customer service,
prepress, the die shop, maintenance — stand around a screen and walk through what happened
in the last twenty-four hours. It takes fifteen minutes. It is the only time in the day the
whole management group is in one room.

Before this product the meeting ran off **a single HTML file** — `Daily_Morning_Dashboard_Vr
22.html`, the twenty-second revision — that kept a day in browser localStorage. One person's
laptop, one browser profile. If that laptop did not open, there was no meeting. Numbers were
retyped by hand every morning out of three spreadsheets. There was no history: yesterday was
gone when today was entered.

Metriq replaces that. It is a **daily morning dashboard**: read the morning, fill in what
no file can supply, and put it on a wall.

## 2. Who uses it

| Who | What they do here | How often |
|---|---|---|
| Production coordinator | Pulls the files at ~07:30, corrects anything the parsers got wrong | Daily |
| Plant manager | Runs the meeting off the wall display; writes the day's review | Daily |
| Department managers (printing, die cutting, gluing, shipping) | One or two sentences about their department's last 24 hours | Daily |
| Customer service, prepress, die shop | A line when there is one — a late spec, an impossible trap, a missing sample | Occasionally |
| Quality manager | Monthly quality workbook; corrects NCR and complaint counts | Monthly |
| Everyone | Reads the wall | Daily |

Most of the floor **has no company email address**, so accounts can be a bare username.

**An important constraint on the whole design:** the person who built this is leaving the
company. Nothing may depend on his account, his machine or his OneDrive. A handover is in
progress.

## 3. What it is built out of

Deliberately, almost aggressively, plain:

- **No framework, no bundler, no build step.** The file in the repository is the file the
  browser runs. HTML, one CSS file, ES modules.
- **One stylesheet** (`assets/metriq.css`, ~2,500 lines).
- **One network module** (`js/db.js`). Nothing else in the app is allowed to talk to the
  network.
- **One parser** (`js/import.js`) reading the plant's `.xlsx` files, with a copy synced to
  the edge functions by a script.
- **Supabase** for Postgres, auth, row-level security, storage and edge functions
  (Deno/TypeScript).
- **GitHub Pages** for hosting. Publishing is `scripts/publish.sh`, run by hand, which
  verifies then pushes a built copy to the `gh-pages` branch. **GitHub Actions is not
  available** — the organisation has no runners — so every check runs locally.
- **`scripts/verify-metriq.mjs`** enforces the architecture rules above as a test.

Why so plain: the person maintaining this in two years will be an IT generalist at a carton
plant, not a front-end specialist. A toolchain is a thing that rots.

## 4. What is on the screen

The morning is divided into **sections**, which are both the page's sections and the slides
of the wall presentation:

Safety · Quality · Production · Last week (Mondays) · Front of house · Shipping ·
Financials · Maintenance & Labour · Needs watching today

Each section is a grid of **cards**. A card is a title bar, one big reading, a bar against
target, and a foot of two to four supporting facts. Colour is a verdict — green on target,
amber near, red off — and every verdict in the product comes from one place (`band` in
`js/readings.js`) so a card and the dot beside its section in the rail can never disagree.

Three ways to look at the same morning:

1. **The overview** — every section, every card, one long page.
2. **A section on its own** — click it in the left rail. Edit fields are open here.
3. **Present mode** — full screen, one section per slide, driven by arrow keys. Three
   shapes: the walk (one at a time), one page (everything), and an overview of six figures.

Type on a card is sized as a proportion of the card, not in pixels: `--u` is one hundredth
of the card, and a JavaScript pass (`fitCards()`) settles one scale factor per screen so
everything on it grows and shrinks together. That is what makes the wall "the page's card,
larger" rather than a second design.

## 5. Where the numbers come from

Three spreadsheets, pulled automatically each morning from SharePoint via a Power Automate
flow that posts to a Supabase edge function, then parsed **in the browser**:

- **The DOR** (Daily Operations Report) — one row per machine per shift per day, thirteen
  years of history. Gives output, crewed hours, run hours, make-ready count and hours, per
  department. Uptime is `(make-ready + run) ÷ crewed`, which is the definition in the
  workbook's own Formulas tab.
- **The OTD/OTIF sheet** — one row per day: jobs shipped, late, short, and the two on-time
  percentages.
- **The monthly KPI workbook and a COQ workbook** — NCRs, internal and external complaints,
  sales, and cost of quality as a percentage of sales.

Everything a file cannot know is typed: injuries, near-misses, overtime, staffing, and the
sentences each department contributes.

Two rules the parsers follow, both learnt the hard way:

- **A column is found by its label, never by its position** — including the plant's
  misspellings, which are matched as written (`Taget`, `Numebr of Trucks`).
- **Absence is an answer.** A missing row means that machine did not run. It is not a
  warning and does not hold up an import.

## 6. What has been built recently, and why

This is the change log an auditor should read as a statement of intent, not as a boast. Each
entry is a real problem the plant reported.

**Typing no longer saves.** Fields used to write 450 ms after the last keystroke and the page
redrew 900 ms after it. Typing a seven-figure number and pausing to glance at a sheet rebuilt
the page and dropped the caret at the front of the box. Fields now save when they are left,
on Enter, or on Save — like a spreadsheet cell. A box with unsaved content shows a bar down
its left edge.

**Cost of quality names its month.** The plant cannot know August's cost of quality in
August; it is totted up after the month closes. The card said "month to date", and the parser
made the same mistake — it read the latest month with any figures in it *including the
current one*, so a partly-typed August row was read as the answer. It now always reads the
month before, carries which month that is, and the card says "COQ — July".

**Comments are signed.** Every comment line is stamped with the writer's initials and a short
date as it is added — `FC 28 Aug — die 4 slow on nights` — written into the note text itself
rather than a side table, because these lines are read in eight places.

**Comments can be changed.** A pencil beside each line puts the words back in the box; saving
replaces the line in place and keeps its original signature.

**An AI "Clean up" button** beside every comment box corrects spelling, grammar and
punctuation and nothing else, with an Undo. It calls Claude through a Supabase edge function
with a deliberately narrow prompt; the API key lives in server settings and never reaches the
browser. It disappears entirely when no key is configured.

**A part-keyed DOR says so.** The pull read die cutting as 13,500 sheets over 16 hours five
times one morning because that was all that had been keyed; by lunchtime the same reader on
the same file gave 53,460 over 40. Nothing distinguished the two. The parser now reports
which shifts (D/A/M) are in each figure and warns when one department has fewer than its
neighbours.

**Publish was removed.** A morning goes up when it is finished — saving a section publishes.
Two endings meant the second one was the one people forgot.

**The card foot grows with the card.** Everything above the rule on a card was a proportion
of the card; the foot was a fixed pixel size, so on the wall the figure was 281 px over a foot
of 27. The foot is now measured the same way as the figure, capped by its own character count
so nothing truncates.

## 7. What is known to be unfinished

Say so rather than rediscovering it:

- **Enter mode and edit-on-card overlap.** There are two, arguably three, ways to type the
  same number: the Enter screen, edit mode on the cards, and now the open fields on a
  section's own screen. This wants collapsing into one model and has not been.
- **The analytics module ("Ask") is designed but not built** — on-demand queries like
  "uptime for die cutting, last six months, by operator". The DOR already carries the
  per-shift rows needed; they are currently discarded after the daily roll-up rather than
  stored.
- **Only one plant is live.** The multi-site behaviour is implemented but unexercised.
- **Supabase's leaked-password protection is off.**
- **Handover items outstanding**: a co-owner on the Power Automate flow, a second
  administrator, transfer of the Supabase project and the GitHub repository.

## 8. What to review, and how to answer

Please give a **specific, prioritised** review. For each finding: what is wrong, why it
matters *to a fifteen-minute meeting in a carton plant*, and what you would do instead. Rank
by impact on the meeting, not by how easy it is to fix. Say when you cannot tell from the
material given, rather than guessing.

Please cover:

1. **Layout and visual design.** Density, hierarchy, alignment, spacing, colour. Does one
   design hold across the page, a single section and a wall ten metres away? Is a card that
   is one big number, a bar and a foot the right object for all of these readings?
2. **Legibility at distance.** The wall is read from across a room, on a mixed shop floor,
   often by people whose first language is not English. What breaks?
3. **Information design.** Is the right thing largest? Is anything on the screen twice? Is
   anything the meeting needs missing? Where does a number arrive without saying where it
   came from or how fresh it is?
4. **Data honesty.** Where can this show a stale, partial or misattributed figure and look
   confident about it? That is the failure mode that matters most: a wrong number on a wall
   is believed by twenty people at once.
5. **Interaction and data entry.** Somebody types into this at 07:30 with a phone in one
   hand. Where is that harder than it needs to be? Are the save semantics clear?
6. **Accessibility.** Contrast, focus order, keyboard use, screen readers, text scaling.
7. **Colour-blindness specifically** — the whole product's verdict system is green/amber/red.
8. **Mobile and tablet.** A supervisor on the floor with a phone.
9. **Security and privacy.** Auth, row-level security, what a browser can reach, what an edge
   function exposes, the AI call.
10. **Reliability and failure modes.** What happens when the pull fails, the network drops
    mid-morning, two people edit the same field, or a spreadsheet changes shape.
11. **Maintainability by a non-specialist**, given the deliberate no-framework choice and
    given that the author is leaving. Is that choice right? What would you change?
12. **What is missing entirely** that a plant like this would expect.

Where a judgement depends on seeing the code, name the file and say what you would look for.

### Files worth pasting alongside this brief

| File | Roughly | For questions about |
|---|---|---|
| `js/readings.js` | 800 lines | Verdicts, card rendering, formatting |
| `js/pages/dashboard.js` | 4,300 lines | The whole dashboard — sections, cards, entry, present mode |
| `js/import.js` | 1,150 lines | Spreadsheet parsing |
| `js/db.js` | 620 lines | Every network call, RLS-facing queries |
| `assets/metriq.css` | 2,500 lines | All layout and type |
| `docs/METRIQ_ARCHITECTURE.md` | — | Why it is shaped the way it is |
| `docs/SOURCE_DATA.md` | — | The three spreadsheets, column by column |
| `supabase/migrations/*.sql` | — | Schema, RLS policies, stored procedures |

A screenshot of the overview page, a section page and a present-mode slide will answer most
of the visual questions faster than the CSS will.

### One thing to be sceptical about

The comments in this codebase are unusually long and explain the reasoning behind each
decision, including decisions that were reversed. They are honest but they are also the
author's own account. **Judge the screen, not the comment.** Where a comment claims a problem
was solved, check whether it was.
