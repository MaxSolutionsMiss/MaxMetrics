# Where the numbers come from

The morning's figures are assembled by hand from several spreadsheets kept in different
places. This is what each one holds, which dashboard field it feeds, and what is derivable
rather than typed. It is the specification the import work is built against.

Everything below was read out of the plant's own files, not assumed.

## DOR_V9.xlsx — production

11 MB. `Die Cutting Data` alone is a million rows of raw shift records; the sheet that
matters is **`Daily Report`**, a pivot with one row per machine per day:

| Column | Meaning |
|---|---|
| Press | the date |
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
