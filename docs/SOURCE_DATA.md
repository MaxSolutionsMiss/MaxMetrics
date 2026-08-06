# Where the numbers come from

The morning's figures are assembled by hand from several spreadsheets kept in different
places. This is what each one holds, which dashboard field it feeds, and what is derivable
rather than typed. It is the specification the import work is built against.

Everything below was read out of the plant's own files, not assumed.

## DOR_V9.xlsx — production

11 MB and eighteen tabs, of which **nine matter**. The rest are stale, scratch, or a
formula store, and can be ignored:

| Tabs | What they are |
|---|---|
| `Printing Data`, `Die Cutting Data`, `Gluing Data` | **the source** — one row per machine per shift, entered from timesheets |
| `Printing By Month`, `Die Cutting by Month`, `Gluing by Month` | monthly productivity, filterable by fiscal year, team and machine |
| `Printing Pivot`, `Die Cutting Pivot`, `Gluing Pivot` | the charts |

The last six are **pivots over the first three**. That makes the Data tabs the only thing
worth importing: everything else in the workbook is a view of them, and MaxMetrics can
compute the same rollups from the daily rows it already stores.

`Daily Report` is *not* a source. It was last refreshed in November 2024 and is not
maintained — an earlier version of this document said it was the sheet that mattered,
which was wrong.

### The shape of a Data tab

Header row is **row 4**, under a title block. One row per machine per shift, keyed by
`Fiscal Year | Month | Week Ending | Day | Date | Team | Shift | Machine`.

The two numbers the dashboard lives on sit in different columns in each sheet, and the
plant reads them by letter:

| Sheet | Net output | Crewed hours |
|---|---|---|
| `Printing Data` | **K** `Net Imps` | **Q** |
| `Die Cutting Data` | **J** `Net Imps` | **Q** |
| `Gluing Data` | **J** `Net Cartons` | **Q** |

Printing carries an extra `# of Plates` column at I, which is what pushes its net output
one place right. Position therefore cannot be assumed across sheets.

### Seven columns called Crewed Hours

Neither can headers be trusted on their own. `Printing Data` labels its right-hand columns
properly — `Maint. Hrs`, `Man Hours`, `MR Target`, `Speed Target`, `Uptime Target`, `Prod`
— but **`Die Cutting Data` and `Gluing Data` head all of Q through W `Crewed Hours`**,
seven identical labels over seven different measures:

| Column | Header says | Actually holds |
|---|---|---|
| Q | Crewed Hours | **crewed hours** |
| R | Crewed Hours | maintenance hours |
| S | Crewed Hours | man hours — crewed × crew size |
| T | Crewed Hours | make-ready target |
| U | Crewed Hours | speed target |
| V | Crewed Hours | uptime target |
| W | Crewed Hours | uptime achieved |

The order is identical to printing's, so the labels were dragged across a row that was
never retyped. An importer that sums every column matching "crewed hours" would add a
speed target of 30,000 to a crew's eight hours. **The leftmost match is the right one**,
and the importer takes it deliberately rather than by luck.

That the targets sit in the daily rows at all is useful: `Speed Target` and `Uptime Target`
per machine agree with `Dept KPIs`, so the same numbers have two sources.

### Three dimensions the dashboard does not use yet

| Dimension | Values |
|---|---|
| Machine | printing `40`, `41` · die cutting `2017`, `2018` · gluing `Bobst`, `Hdlbrg`, `Omega` |
| Shift | `D` days, `A` afternoons, `M` midnights |
| Team | the crew leader's name |

Retired machines still appear in history — printing `29`, die cutting `TR`, `JRK` and a
`Bobst` that was a die cutter rather than the gluer of the same name. None has run since
2024. They are carried in `machines` as inactive so an old row still resolves to something
instead of being dropped.

Storing imports at **shift and machine grain** rather than rolling straight to a
department day would let MaxMetrics answer the same questions the By Month pivots answer —
productivity by team, by machine, by shift, across years — without anyone opening the
workbook. The department figure the morning dashboard shows becomes a sum over those rows
rather than a separately stored number.

### The week the plant runs

Production starts **Sunday night in die cutting**, runs twenty-four hours Monday through
Thursday, and stops around 22:00 Friday. Gluing works some Sundays too; printing has not
worked a Sunday all year — 0 of 582 rows in 2026, against 60 of 924 in die cutting and 52
of 1,069 in gluing.

This is why a crew leader can be absent from the sheet for months and still work here. A
line that does not crew every shift produces gaps that look like departures and are not,
so **shift dates cannot be used to decide who is still employed** — a mistake worth
recording because it was made here first.

### One thing to fix in the source

Team names are typed, not picked from a list, and the same person appears more than once:

- `Anton Philips` (116 rows), `Anton Phillips` (16), `Anton Phillips ` (16, trailing space)
- `Pawan Jeet` (33), `PAWAN JEET` (3)
- shift `M` (279) and `M ` (2)

Any pivot filtered by Team therefore splits Anton's 148 shifts across three entries and
reports each as a different person. The importer will normalise names on the way in —
trimmed, collapsed spacing, matched case-insensitively against names already seen — but
the workbook itself is still wrong, and a validation list on that column would stop it
happening again.

### The daily figures

The department figure the dashboard shows comes from the same rows:

| Column | Meaning |
|---|---|
| Date | the day |
| Run Speed | output per running hour |
| **NNN Speed** | output per crewed hour |
| Uptime | fraction of crewed time running |
| **Net Imps** | sheets or cartons produced |
| # of MR's, Avg MR Time | make-readies and their average length |
| Run Hrs | hours the machine was running |
| **Crewed Hours** | hours the crew was on it |

**`NNN Speed` is exactly `Net Imps ÷ Crewed Hours`** — checked across the sheet, no
exceptions — and that is the number the dashboard shows as the departmental rate. So the
dashboard's rate is not a separate measure to be reconciled; it is a column the DOR
already computes.

Crewed hours cover **the past twenty-four hours across every machine in the department**,
which is why they run to 16.5, 23 and 55.5 rather than to one shift.

- `Net Imps` → `daily_departments.qty`
- `Crewed Hours` → `daily_departments.hours`

The sheet is one machine at a time (`Machine | 40`), so a department's figure is the sum
across its machines.

## OTDOTIF.xlsx — shipping

Sheet **`OTD 2026`**, one row per shipping day:

`Date | Numebr of Trucks | # of Shipped Job | Late | Short | OTD | OTIF`

(The header typo is theirs and the importer must tolerate it — this is exactly why columns
are matched loosely rather than by exact string.)

**Both percentages follow from the three counts:**

```
OTD  = (jobs − late) ÷ jobs
OTIF = (jobs − late − short) ÷ jobs
```

Verified against 149 rows: 148 agree exactly. The one that does not is 29 July 2026, where
the sheet records 100% against 5 jobs with 1 late. The dashboard export for the following
morning has the same day at 80%, so the spreadsheet row is the wrong one — an error the
derivation catches for free.

MaxMetrics therefore **computes OTD and OTIF** and no longer asks anyone to type them.
MTD and YTD OTIF are still entered; both are running averages the sheet keeps in its
right-hand columns, and both could be derived from our own stored days later.

## Mississauga_KPIs.xlsx — targets and quality

**`Dept KPIs`** holds the real targets, per machine, and the department averages the
dashboard actually uses:

| Department | Machines | Targets | Dept average |
|---|---|---|---|
| Printing | 40" Press, 41" Press | 3300, 2800 | **3050** |
| Die Cutting | 2017, 2018 | 1850, 2200 | **2025** |
| Gluing | Heidelberg, Bobst, Omega | 14000, 8800, 13000 | **11933** |

So a department target is the mean of its machines' targets, and changing a machine moves
it. The same sheet carries **make-ready** and **uptime** targets per machine.

The sheet is titled *Mississauga **2026** Machine KPIs*, and that word is the whole design
of how MaxMetrics stores this. A target is a property of a machine **in a year**, not of a
department forever: 2027 will have its own, and last year's rate must go on being judged
against last year's number rather than being retroactively re-marked. So targets live in
`machine_targets (machine, year)`, a department's target is a view over the mean of its
live machines — reproducing the sheet's `Dept. Average` column exactly, 3050 / 2025 /
11933.33 — and setting 2027 is inserting rows, never overwriting.

`location_departments` keeps the same three columns as a default for a plant that has not
had its machines listed yet.

**`COQ 2025`** (2026 data despite the tab name) is monthly: `Month | COQ | Sales | COQ % of
Sales | Target`. The percentage is `COQ ÷ Sales`, target 0.85%. June reads 0.23%, which is
the figure on the dashboard.

Other sheets not yet used: `Stock Variance`, `Labour Cost`, `Overtime`, `Production &
Delivery Summary`.

## Production_Throughput_KPI.xlsx — the weekly report-out

Four tabs — `2024`, `2025`, `2026`, `OTD&OTIF` — laid out sideways: rows are measures, one
column per week, ending in a YTD total. Per machine and per department it carries
make-readies, output, average order quantity, crewed hours and output per crewed hour, then
plant totals and the week's OTD and OTIF.

**Nothing on it is new data.** Every figure is a rollup of the DOR's daily rows by
`Week Ending`, and the one measure that looks independent is not:

```
average order qty = sheets produced ÷ # of MR's
```

— 321,845 ÷ 17 = 18,932.06, matching to the cent. A make-ready is an order changeover, so
counting them counts orders.

Rebuilt from the DOR for all thirty weeks of 2026, the sheet reproduces exactly in **73 of
90** department-weeks, with the rest drifting by a few thousand — the report is a snapshot
taken on the day, and the daily rows kept being corrected afterwards. Two things are worth
knowing:

- `WEEK 1` is the week ending **10 January**, not 3 January. The short fiscal-year-opening
  week is left out, so week numbers are offset by one from a straight count of
  `Week Ending` values.
- **Week 30 gluing is missing its Sunday.** The sheet reports 4,203,973 cartons against the
  DOR's 4,581,634. The gap is exactly the three Sunday shifts of 26 July — 377,661 cartons
  on Bobst and Omega, 24 crewed hours — while printing and die cutting for the same week
  include theirs. Heidelberg is short a further 8 crewed hours, an idle Saturday shift that
  produced nothing. The effect is not neutral: Omega's cartons per crewed hour reads 13,907
  where the machine actually ran 15,563, so a good week is reported as a poor one.

Neither is a reason to import this file. They are reasons not to: a weekly number computed
from stored daily rows cannot lose a Sunday, cannot drift from a correction made later, and
does not have to be rebuilt by hand every Monday. **MaxMetrics should generate this sheet
rather than read it**, which also gives the weekly view the plant reports on for free.

The `OTD&OTIF` tab is one row per week from January 2025, and is the weekly form of the
same counts `OTDOTIF.xlsx` holds daily.

## Quality — SharePoint

Quality data lives in a SharePoint library under an individual's personal OneDrive:

```
.../personal/antonbirman_maxpkgsolutions_com/Documents/KPI Reporting/Mississauga/2026/
```

Worth saying plainly: KPI reporting for a plant sitting in one person's personal OneDrive
is fragile. If that account is closed or its permissions change, the folder goes with it.
Moving it to a team site costs nothing and removes a single point of failure.

## What a hot folder can and cannot be

MaxMetrics is a static site. A page in a browser **cannot watch a folder** — there is no
process running when nobody has it open, and a browser cannot read a network share on its
own. Any promise of "point it at a folder and forget it" has to say where the watching
happens.

Three honest options, in the order they cost effort:

1. **Drop the files on the page.** Someone selects or drags the day's workbooks; the
   parser reads them and fills the morning in. Needs nothing from IT, works with files on
   a network share, and covers the case where the numbers are being collected by a person
   anyway. This is the one to build first.

2. **A watcher on a plant PC.** A small script that watches the folders, parses anything
   new and posts it to Supabase. Genuinely hands-off, survives nobody opening the page,
   and needs one machine that stays on plus permission to run it.

3. **Microsoft Graph against SharePoint.** A scheduled Supabase function that reads the
   library directly. The cleanest end state, and the one that needs an Entra app
   registration and IT consent — the same conversation that stalled ticket #5439.

Whichever is used, the parsing rules are the same, which is why they belong in the app
rather than in the watcher.

## Matching columns loosely

Files are made by people and change shape. The importer identifies a column by normalising
its header — lowercased, punctuation and spaces removed — and matching against a list of
known spellings per field, including the misspellings already present:

| Field | Accepts |
|---|---|
| jobs shipped | `# of shipped job`, `shipped jobs`, `jobs` |
| late | `late`, `late shipments` |
| short | `short`, `shorts`, `short shipments` |
| volume | `net imps`, `net impressions`, `qty`, `volume` |
| crew hours | `crewed hours`, `crew hrs`, `crewed hrs` |

The header row is found by scanning for the first row that matches several known columns,
rather than assuming row 1 — these exports carry title blocks above their headers.

## The rest of Mississauga_KPIs.xlsx

The sheets beyond `Dept KPIs` and `COQ` are all **monthly or per-pay-period**, not daily.
That matters: none of them belongs on a morning dashboard, because a number that moves
once a month cannot be discussed usefully in a two-minute meeting twenty times a month.
They belong on a separate monthly view, which is worth building but is not this one.

| Sheet | Grain | Holds |
|---|---|---|
| `Stock Variance` | monthly | inventory accuracy against a target of 1.000 — July 0.998 |
| `Labour Cost` | pay period | earnings, 2024/2025/2026 side by side |
| `Overtime` | pay period | OT hours and dollars, three years side by side |
| `Production & Delivery Summary` | monthly | orders, deliveries, cartons produced and delivered, invoiced CAD, revenue per 1000 cartons, revenue per order |
| `Printing` / `Die-Cutting` / `Gluing` | monthly | the DOR columns rolled up, plus `Target Net Output/Crewed Hrs` and `Target Avg Make-Ready Time`, pre-filled to December |

The department sheets confirm the naming: the dashboard's production target is **target net
output per crewed hour**, which is why it compares against `NNN Speed` and not `Run Speed`.

### Two KPIs the DOR already carries daily and the dashboard does not show

`Uptime` and `Avg MR Time` are in the daily report next to the volumes already being read,
and `Dept KPIs` sets a target for both on every machine — 0.88 uptime on the 40" press,
1.25 hours make-ready, and so on. They are the most obvious next readings, because they
need no new source and no new typing.

### Two numbers in the Overtime sheet that are wrong

Overtime averages **$38–40 an hour** across all three years. Two rows do not:

- `2025-01-04` — 295.7 hours for $3,090.40, which is $10.45 an hour
- `2026-04-11` — 432.2 hours for $1,832.39, which is $4.24 an hour

Both look like an amount typed short. Neither is used by the morning dashboard, so nothing
downstream is affected, but they will distort any yearly overtime comparison drawn from
this sheet.

### What the summary sheet says about the business

Revenue per 1000 cartons delivered fell from **$271 in January 2025 to $143 by March
2026**, recovering to roughly $173–190 through mid-2026. Over the same period overtime
rose: 2026 is running about 1,035 OT hours per pay week against 858 in 2025 and 952 in
2024 — the highest of the three years.

More cartons for less revenue, produced with more overtime, is a margin story rather than
a production one, and it is the kind of thing a monthly view should put in front of people
rather than leaving it to be noticed.
