# Hot folders

Six spreadsheets in five places become one morning, without anybody opening a browser.

A scheduled task on one Windows PC reads the folders that PC can already see and posts each
file to the `ingest` endpoint, which runs the *same parser the Import screen runs* and
writes through `import_morning` — so a reading somebody typed is never overwritten, and a
file sent twice changes nothing the second time.

Why a PC and not a cloud flow is in
[MAXMETRICS_ARCHITECTURE.md](../../docs/MAXMETRICS_ARCHITECTURE.md#how-the-files-get-here).
The short version: the Z: drive is not visible to Microsoft 365 at all, and everything that
is visible needs a permission someone has to grant.

## Setting it up

Pick the machine first. It must be one that stays on overnight, has the shares mapped, and
has OneDrive signed in — usually the office PC of whoever assembles the morning today.

**1. Set the key.** Ask for the value of `MAXMETRICS_INGEST_KEY`; it is the shared secret
the endpoint checks. In a Command Prompt on that machine, as the account the task will run
as:

```
setx MAXMETRICS_INGEST_KEY "the-key"
```

Sign out and back in — `setx` does not affect sessions that are already open.

**2. Name the folders.** Copy `sources.example.json` to `sources.json` in the same folder
and edit it. Each entry is one spreadsheet. The comments in the example say what each field
does; the only two that need thought are `dateFrom` (which morning the numbers belong to)
and `newestOnly` (one file, or every file in the folder).

**3. Prove it before scheduling it.**

```
powershell -ExecutionPolicy Bypass -File maxmetrics-watch.ps1 -WhatIf
```

`-WhatIf` lists what it found and what date it would file each one under, and sends
nothing. When the list looks right, run it again without `-WhatIf` and open the dashboard.

**4. Schedule it.** 5:30am, so the numbers are in before anyone looks:

```
schtasks /Create /TN "MaxMetrics morning pull" /SC DAILY /ST 05:30 ^
  /TR "powershell -ExecutionPolicy Bypass -File \"C:\MaxMetrics\maxmetrics-watch.ps1\"" ^
  /RU "%USERDOMAIN%\%USERNAME%" /RP *
```

`/RU` matters. A task running as SYSTEM has no mapped drives and no OneDrive, and every
source will report as unreachable.

## When a number is missing

`%LOCALAPPDATA%\MaxMetrics\watch.log` has a line per file per run. The four things it says:

| Line | What happened |
|---|---|
| `… is not reachable from this account` | the drive is not mapped, or the task is running as the wrong user |
| `… is locked and could not be copied` | somebody has the workbook open *and* the copy failed — rare; usually the copy gets through |
| `… → 0 morning(s)` | the file was read but held nothing recognisable — the tab names probably changed |
| `operators not on file: …` | a name in the timesheet is not in the operator list, so those hours were not counted |

A file is only marked done once the endpoint accepts it, so a bad morning retries by
itself the next day. To resend everything regardless, run with `-All`.
