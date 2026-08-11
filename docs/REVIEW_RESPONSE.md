# MaxMetrics — response to the review, and a plan

*11 August 2026. Written against the code as it stands at commit `9217343`, with every claim
below checked in the source or the database rather than taken on trust.*

---

## The short version

It is a good review. About half of it names something real, and two of those are bugs I would
want fixed this week whatever else happens. About a quarter of it is aimed at the dashboard
MaxMetrics replaced rather than at MaxMetrics — the reviewer was clearly given the old
`Daily_Morning_Dashboard_Vr 22.html` alongside the briefing, and several findings are true of
that file and not of this one. The last quarter is a matter of taste, and in two places it
directly contradicts decisions you made in the last fortnight. Those are your call, not its
and not mine, and I have flagged them rather than quietly doing either thing.

I have not changed any code yet. What follows is the five things the review asked for before
code — architecture, wireframes, files, migrations, phases — plus the honest scoring that
should come first.

---

## 1. What it got right

**① "Everything is on target" can be a lie.** This is the most serious finding and it is
correct. `assess.js` only produces a reading when the value is present — `has(value)` guards
every push — so a morning with nine of twenty readings entered yields nine findings, all of
them within target, and Today prints *"Everything is on target · All 9 readings within target
this morning."* Eleven missing readings are simply not counted. A person reading that sentence
across a room has been told something false. **Fix: yes, first.**

**② "No issues reported" is printed before anybody reports anything.**
`daily_review.status` defaults to `'ok'` in Postgres and the note defaults to `''`, so the
moment a morning is opened, every department is already saying it had no issues. Confirmed in
the schema. The review is right that an untouched field must read *"Not confirmed yet"* and
must not count as clear. **Fix: yes, first.**

**③ A target change rewrites history.** `SHIPPING_TARGET = 98` is a constant in
`readings.js`; `uptime_target` and `mr_target` are read from the *current* department
configuration; and a department day with no stored target falls back to today's configured
target. Change the OTIF target to 97 next January and every dashboard back to 2025 restates
itself — green mornings turn amber and amber mornings turn green, retrospectively. Daily COQ
targets and daily department targets are stored per day and are safe; these three are not.
**Fix: yes. Cheap, and the fix is small.**

**④ Enter asks for far more than it needs.** I counted it: **66 controls, of which 2 are
actually outstanding** on a normal Mississauga morning, and 21 are values a file has already
filled. The review's diagnosis is right even if I would not take all of its prescription.
**Fix: yes, but see §6 for where I differ.**

**⑤ Nothing on a card is programmatically labelled.** Also counted: **32 of the 66 controls on
Enter have no label, no `aria-label` and no `id`** — the maintenance table and the notes rows
use `<div class="fr">` with a `<span>`, not a `<label>`. Every in-card edit field
(`inp--foot`, `inp--hero`, `inp--cell`) is unlabelled too. This is real, it is cheap, and it
also breaks voice control and browser autofill, not just screen readers. **Fix: yes.**

**⑥ Publishing an incomplete morning should take a deliberate act.** There is no guard at all
today: Publish always publishes. An override with a short reason is the right shape. **Fix:
yes.**

**⑦ Automatic rotation on the broadcast screen.** Not built, obviously right for a corridor
TV, half a day's work. **Fix: yes.**

**⑧ Zero and missing should read differently on a derived percentage.** Partly right — see
§2 — but the refinement is worth taking: zero jobs shipped should say **N/A**, and no jobs
figure at all should say **not entered**. Today both print an em dash. **Fix: yes.**

---

## 2. What it got wrong, or aimed at the wrong product

Each of these I checked rather than assumed.

| The review says | What the code actually does |
|---|---|
| "If jobs shipped is zero, percentages display 100%" | `derivedShipping()` returns `null` when jobs is zero or missing, so OTD and OTIF print an em dash. Never 100%. *(True of the old dashboard.)* |
| "Merge the existing Board into Morning Summary" | The Board was deleted last week, for the reason the review gives. There is no Board. |
| "Use stable metric and department IDs, not array positions" | Nothing is keyed by position. Departments are `dept_key`, readings are named columns, cards are `pkey`. *(The old dashboard used array positions.)* |
| "Use local storage only for harmless UI preferences" | There is no `localStorage` in the application at all. Supabase is already the only source. *(The old dashboard kept a whole day in one localStorage blob.)* |
| "Previous exports use both `prSheets` and `prod_printing_qty`, so imports must be migrated deliberately" | Both spellings are already handled — `readDashboardJson()` in `import.js` normalises them, and `scripts/check-import.mjs` checks all seven shapes on every publish. This is done. |
| "Confirm Row Level Security restricts plant and role access" | Checked. No table is missing RLS. Two advisories exist and both are intentional (`import_morning`, `ensure_day` and `carry_forward` are `SECURITY DEFINER` on purpose — they are the guarded write path). One real free win: **leaked-password protection is off** in Auth; that is a toggle, not code. |
| "Do not patch the numbered standalone DailyDashboard HTML copies" | There are none in this repository. Nothing to avoid. |
| "Avoid unnecessary sparklines" | Every card carries one because you asked for them, twice, and asked for them *larger*. I am treating this line as not applying. |

None of this makes the review bad — it makes it a review of two products at once. It is worth
knowing which half is which before spending a month on it.

---

## 3. Where it contradicts you, and what I would do

**The one-page screen.** The review says: *replace the 24-card One Page with an Overview of
six to eight priority KPIs.* You said, on 9 August: *"By one page, I meant everything closed
in one page… all the cards in one page… If somebody wants a snapshot, I wanna send a snapshot
of this or post it on a TV."*

Both are defensible and they are for different rooms. A 27-card collage is a **snapshot** —
the thing you screenshot and send, or hang where somebody walks past twice a day and reads
whichever card they came for. A six-tile overview is a **glance** — the thing that answers
"is the plant all right" from ten metres in four seconds. My recommendation is to build the
second **as well as**, not instead of: present mode gets three shapes rather than two — the
walk, the collage, and a new Overview — and the plant picks which one the TV runs. Nobody
loses anything they asked for and it is about a day of work.

**Renaming everything.** The review wants Complete Morning / Morning Summary / Full Detail /
History / Settings, with Safety…Labour demoted to filters. Twenty people are currently
learning the words that are on screen now. I would take exactly one of those renames —
**Today → Morning summary**, because it is genuinely a better name for what that screen does —
and leave the rail alone. The sections are not "another competing level of navigation"; they
are how a quality manager gets to the six quality cards without reading past shipping, and
they are the same list the meeting walks. Demoting them to filters costs a click on the
journey people make most.

**Collapsing the imported data.** The review wants DOR/OTIF/KPI values hidden behind a
collapsed panel. You said the opposite in July: *"shown here so it can be corrected — not so
it has to be typed."* I would keep them visible and instead do the thing that actually solves
the complaint — a **Required now** band at the top that names the two outstanding fields and
jumps to them — plus one collapse control for the imported set, default open, remembered per
person. That way the fast path is two clicks and the correcting path is unchanged.

---

## 4. The proposed revised information architecture

Rail, top to bottom. Changes marked.

```
  Enter            → Complete morning        (renamed; same screen, restructured)
  Today            → Morning summary         (renamed; rebuilt — see §5)
  ─────
  Everything                                 (unchanged)
  Safety · Quality · Production · Shipping ·
  Financials · Maintenance & Labour          (unchanged — kept as sections, not filters)
  ─────
  Configure                                  (unchanged; gains publish rules + presentation)
```

Present mode gains a third shape:

```
  Present ▸ One at a time    the meeting walk          (unchanged, still the default)
          ▸ One page         the 27-card collage       (unchanged)
          ▸ Overview         six tiles, auto-rotating  (new)
```

The state model the review asks for, named once and used everywhere:

```
  missing    nothing entered and no file supplied one
  stale      a file supplied it, but the file's own log ends before this date
  na         the arithmetic has no denominator (zero jobs shipped)
  ok         present, current, at or better than target
  warn       present, current, within the warning band
  stop       present, current, past the warning band
```

`assess.js` already computes `ok`/`warn`/`stop` and is the only place allowed to judge. The
change is that it stops *skipping* absent readings and starts emitting them as `missing`,
which is what makes the count at the top of the summary honest.

---

## 5. Text wireframes

### Complete morning

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  REQUIRED NOW · 2                                              [ Publish ▸ ]  │
│  Jobs short today  →      Cartons  →      Confirm 4 departments  →           │
│  Everything else came from the DOR, the OTIF sheet and the KPI workbook.      │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ SAFETY ─────────┐┌─ PRODUCTION ─────┐┌─ SHIPPING ───────┐┌─ LAST 24 HOURS ──┐
│ Last injury  [ ] ││ Printing    [ ]  ││ Jobs shipped [ ] ││ Printing         │
│ Record       [ ] ││ Hours       [ ]  ││ On time      [ ] ││ ( ) No issues    │
│ Last near-…  [ ] ││ Die Cutting [ ]  ││ Late         [ ] ││ ( ) Watch        │
│ Record       [ ] ││ Hours       [ ]  ││ Short        [ ] ││ ( ) Issue        │
└──────────────────┘│ Gluing      [ ]  ││ Cartons    ⟨ ⟩ ! ││ [ note……       ] │
┌─ QUALITY ────────┐│ Hours       [ ]  ││ OTIF month   [ ] ││ ── not confirmed │
│ Jobs short ⟨ ⟩ ! ││ Windowing   [ ]  ││ OTIF year    [ ] ││ Die Cutting      │
│ COQ month    [ ] ││ Hours       [ ]  │└──────────────────┘│ (•) Watch        │
│ COQ year     [ ] │└──────────────────┘┌─ OVERTIME ───────┐│ [ Die 4 slow…  ] │
│ NCRs         [ ] │┌─ SALES ──────────┐│ Printing 2 ▣40"  ││ Gluing           │
│ Internal     [ ] ││ Month to date[ ] ││ Die Cutting  —   ││ ( ) not confirmed│
│ Customer     [ ] ││ Year to date [ ] ││ Gluing   3 ▣Hdlb ││ Staffing         │
└──────────────────┘└──────────────────┘└──────────────────┘└──────────────────┘

┌─ UPCOMING MAINTENANCE ───────────────────────────────  [ Add an item ] ──────┐
│ Dept       Machine          Hrs   What for        When         Status        │
└──────────────────────────────────────────────────────────────────────────────┘

  ⟨ ⟩ !  outstanding — named in the banner, amber border, jumped to from it
  [ ]    filled by a file — greyed, dashed, corrected in place, source named
  ── │   IMPORTED DATA · DOR 05:31 ✓ · OTIF 05:31 ✓ · KPI 1 Aug ⚠ 11 days old
```

Three things change from today: the banner names what is missing and jumps to it; every
department's last-24-hours row starts at **not confirmed** and has to be answered; and the
source strip along the bottom says when each file last arrived and goes amber when one is
stale. The four-column shape, the in-place fields and the visible imported values stay.

### Morning summary

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   2 CRITICAL      3 WARNING      4 MISSING      14 ON TARGET                  │
│   ▔▔▔▔▔▔▔▔▔▔      ▔▔▔▔▔▔▔▔▔      ▔▔▔▔▔▔▔▔▔      ▔▔▔▔▔▔▔▔▔▔▔▔                  │
│   Four readings are missing. This morning is not complete.                    │
└──────────────────────────────────────────────────────────────────────────────┘

  NEEDS THE ROOM
┌────────────────────┐┌────────────────────┐┌────────────────────┐
│ DIE CUTTING        ││ OTIF               ││ CARTONS            │
│ 1,833  ▼ −9.5%     ││ 92.68%  ▼ −5.43%   ││ not entered        │
│ against 2,025/hr   ││ against ≥ 98%      ││ nobody has filled  │
│ Die 4 slow nights  ││ 2 late · 1 short   ││ this in            │
└────────────────────┘└────────────────────┘└────────────────────┘

  TALKING POINTS · last 24 hours
  • Die Cutting — Die 4 ran slow through the night shift; waiting on a plate for 8841
  • Maintenance — Gluer 3 belt replaced overnight

  ON TARGET   264 injury-free · 0.92 COQ · 41 shipped · 95.12 OTD · $1.42M MTD · +11 more
```

The four-count header is the whole point: **missing is a first-class number**, sitting beside
critical and warning, and "Everything is on target" can only be printed when the missing count
is zero.

### Presentation overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  MISSISSAUGA                                        Tuesday 11 August 2026    │
│                                                                               │
│   SAFETY               QUALITY               PRODUCTION                       │
│                                                                               │
│     264                  0.92%                 −3.9%                          │
│     DAYS INJURY-FREE     COST OF QUALITY       AGAINST TARGET                 │
│                                                                               │
│   DELIVERY             PEOPLE                FINANCIALS                       │
│                                                                               │
│     92.68%               5                     $1.42M                         │
│     OTIF TODAY           OVERTIME SHIFTS       MONTH TO DATE                  │
│                                                                               │
│  ● Die Cutting −9.5%   ● 2 late   ● 40" Press down 4 h today                  │
│                                              ▮▯▯  ⏸  ‹ ›   auto 18s          │
└──────────────────────────────────────────────────────────────────────────────┘
```

Six tiles, one per family, each showing the family's single most load-bearing number at
roughly 70px on a 1080p screen with a 26px label. The strip along the bottom is the three
worst things, and the controls are pause and step. Financials is droppable for a floor screen
using the switch that already exists.

---

## 6. Files and components that change

| File | What changes |
|---|---|
| `js/assess.js` | Emit `missing` and `stale` readings instead of skipping them; add `na`. Add `counts()` returning `{stop, warn, missing, ok}`. This is the load-bearing change; everything in §1① and §5 follows from it. |
| `js/readings.js` | `stateOf()` — one function every surface asks for a reading's state. `derivedShipping` distinguishes zero from missing. `footLine`/`metricCard`/`listCard` gain `aria-label` on every field. A `missing` card draws "not entered", never a dash that could be read as nought. |
| `js/pages/dashboard.js` | The Today view becomes the Morning summary (§5). Enter gains the Required-now banner, the source strip and the not-confirmed review rows. Publish gains its guard. Present gains the Overview shape and the rotation timer. `SECTIONS.line` is where most of it lands. |
| `js/pages/departments.js` | Configure gains: which presentation shape the TV runs, rotation interval, and who may publish an incomplete morning. |
| `assets/maxmetrics.css` | `.state--missing` / `.state--stale` treatments; the summary header; the overview tiles; focus rings on every control. No change to the palette, the faces or the card. |
| `js/db.js` | Reads and writes the new review status; reads the frozen targets; writes publication revisions. |
| `scripts/verify-maxmetrics.mjs` | Two new rules: no surface may compute a state itself, and every `<input>` the product emits must carry a label or an `aria-label`. Checked on every publish, so neither can come back. |

Not touched: the palette, the type ramp, the card component's geometry, the walk, the collage,
Supabase auth, the importers, or any stored value.

---

## 7. Database migrations

Three, all additive, none destructive.

**M1 — reviews start unanswered.**

```sql
alter table public.daily_review alter column status drop default;
alter table public.daily_review alter column status drop not null;
-- Existing rows are left exactly as they are. A row that says 'ok' today was
-- either answered or defaulted, and we cannot tell which — so history keeps its
-- answer and only mornings opened from now on start blank.
```

**M2 — targets freeze onto the day.** The plant-wide targets that live in code or in the
current configuration get a per-day home, written when the day is opened and never rewritten:

```sql
alter table public.daily_metrics
  add column if not exists otif_target numeric,
  add column if not exists otd_target  numeric;
alter table public.daily_departments
  add column if not exists uptime_target numeric,
  add column if not exists mr_target     numeric;
-- ensure_day() fills them from the location's configuration at open time.
-- Historical rows stay null and fall back to the constant, which is what they
-- were judged against when they were published.
```

**M3 — publishing keeps a history.**

```sql
create table if not exists public.publications (
  id            uuid primary key default gen_random_uuid(),
  location_id   text not null references public.locations(id),
  metric_date   date not null,
  revision      int  not null,
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users(id),
  incomplete    boolean not null default false,
  override_note text,
  snapshot      jsonb not null,          -- the morning exactly as it was published
  unique (location_id, metric_date, revision)
);
```

Republishing appends a revision rather than replacing one, and an incomplete publish records
who forced it and why. The snapshot is what makes "a target change must not alter a published
dashboard" true by construction rather than by discipline.

**What I would *not* migrate to.** The review asks for one row per metric per day carrying
value, unit, target, status, source, source timestamp, stale flag, override flag, override
reason and revision. That is the right shape for a product with nine plants and an audit
requirement, and it is a rewrite of every read and write path in the application for a benefit
you can get 80% of from M2 and M3. I would revisit it when the second plant goes live, and not
before.

---

## 8. Phased plan

Each phase is publishable on its own and none of them changes a stored value.

**Phase 1 — the two bugs. (about a day)**
`assess.js` emits missing readings · the summary header counts them · "Everything is on
target" becomes conditional · `daily_review` starts unanswered and untouched departments read
"Not confirmed yet" · zero jobs shipped reads N/A. **M1.**
*Risk: none to data. This is the phase I would ship first regardless of what happens to the
rest.*

**Phase 2 — labels and focus. (half a day)**
Every input, select and textarea gets a programmatic label; visible focus rings; state carried
by text and shape as well as colour. Two new conformance rules so it stays fixed.
*Risk: none.*

**Phase 3 — Enter, restructured. (two days)**
Required-now banner with jump links · the source strip with each file's last-arrival time and
a stale warning · full labels restored, nothing truncated · one collapse control for the
imported set · publish guard with override and reason.
*Risk: low. The screen keeps its shape; nothing moves that people have learned.*

**Phase 4 — Morning summary. (a day and a half)**
The four-count header, the exceptions, Talking Points from the last-24-hours notes, the
on-target strip compressed to one line.
*Risk: low — it is one view over `assess()`, which Phase 1 has already made honest.*

**Phase 5 — Presentation overview and rotation. (a day)**
The six-tile Overview as a third shape · auto-rotation with pause and step · type sized for
1080p at four metres · the Financials switch already exists and applies.
*Risk: none to the walk or the collage, both untouched.*

**Phase 6 — history that cannot be rewritten. (two days)**
**M2** and **M3** · targets frozen at open · publications appended as revisions · a small
History screen that can show a past morning exactly as it was published.
*Risk: the highest of the six, because it touches the publish path. It goes last for that
reason, and it is the phase I would want you watching.*

Total, if all six run: about eight working days. Phases 1 and 2 are a day and a half and I
would do them whether or not you want the rest.

---

## 9. What I need from you

1. **The one page** — keep the 27-card collage and add the six-tile Overview beside it, as I
   recommend? Or replace it, as the review asks?
2. **The renames** — take "Morning summary" only, or the reviewer's full set?
3. **Who may publish an incomplete morning** — anybody with a reason, or only a named role?
4. **Auto-rotation** — is there actually a TV running this yet, or is Phase 5 speculative?
5. **Go on Phases 1 and 2 now**, before the rest is settled?
