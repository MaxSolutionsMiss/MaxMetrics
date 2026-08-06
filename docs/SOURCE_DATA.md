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

Header row is **row 4**, under a title block. Columns:

`Fiscal Year | Month | Week Ending | Day | Date | Team | Shift | Machine | # of Plates |
MR Imps | Net Imps | Gross Imps | # of MR's | MR Hrs | Run Hrs | Sched Maint | Crewed Hours`

and further right, `MR`, `Speed`, `Uptime`.

The same field sits in a different column in each of the three sheets — `Net Imps` is
column 10 in printing and 9 in die cutting — so position cannot be assumed and headers
must be matched by name.

### Three dimensions the dashboard does not use yet

| Dimension | Values |
|---|---|
| Machine | printing `40`, `41` · die cutting `2017`, `2018` · gluing `Bobst`, `Hdlbrg`, `Omega` |
| Shift | `D` days, `A` afternoons, `M` midnights |
| Team | the crew leader's name |

Storing imports at **shift and machine grain** rather than rolling straight to a
department day would let MaxMetrics answer the same questions the By Month pivots answer —
productivity by team, by machine, by shift, across years — without anyone opening the
workbook. The department figure the morning dashboard shows becomes a sum over those rows
rather than a separately stored number.

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
it. The same sheet carries **make-ready** and **uptime** targets per machine, neither of
which the dashboard shows yet.

**`COQ 2025`** (2026 data despite the tab name) is monthly: `Month | COQ | Sales | COQ % of
Sales | Target`. The percentage is `COQ ÷ Sales`, target 0.85%. June reads 0.23%, which is
the figure on the dashboard.

Other sheets not yet used: `Stock Variance`, `Labour Cost`, `Overtime`, `Production &
Delivery Summary`.

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
