# The hot folders, read from a machine that can already see them.
#
# Every other way of getting these files needs somebody's permission: Power Automate needs
# the HTTP connector licensed, Microsoft Graph needs an app registration and admin consent,
# and neither of them can see the Z: drive at all. A scheduled task on a PC that has the
# share mapped and OneDrive synced needs none of that — it reads files it is already
# allowed to read and posts them to one endpoint.
#
# Run once per morning from Task Scheduler. It is safe to run more often: a file whose
# contents have not changed since the last run is not sent again, and the endpoint writes
# through `import_morning`, which never replaces a reading somebody typed.
#
#   powershell -ExecutionPolicy Bypass -File metriq-watch.ps1
#   powershell -ExecutionPolicy Bypass -File metriq-watch.ps1 -WhatIf   # list, send nothing
#   powershell -ExecutionPolicy Bypass -File metriq-watch.ps1 -All      # ignore the state file

[CmdletBinding()]
param(
  [string] $Config = (Join-Path $PSScriptRoot 'sources.json'),
  [string] $StateFile = (Join-Path $env:LOCALAPPDATA 'Metriq\seen.json'),
  [string] $LogFile = (Join-Path $env:LOCALAPPDATA 'Metriq\watch.log'),
  [switch] $All,
  [switch] $WhatIf
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Line([string] $text, [string] $colour = 'Gray') {
  $stamped = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $text
  Write-Host $stamped -ForegroundColor $colour
  # The log is what somebody reads at 7am when a number is missing, so it is written
  # whether or not anyone was watching the console.
  $null = New-Item -ItemType Directory -Force -Path (Split-Path $LogFile)
  Add-Content -Path $LogFile -Value $stamped
}

# ---------------------------------------------------------------- configuration

if (-not (Test-Path $Config)) {
  Write-Line "No configuration at $Config. Copy sources.example.json to sources.json and edit it." 'Red'
  exit 2
}
$settings = Get-Content $Config -Raw | ConvertFrom-Json

# The key is an environment variable rather than a line in the config file, because the
# config file sits beside the folders it names and gets copied around with them.
$key = $env:METRIQ_INGEST_KEY
if (-not $key) {
  Write-Line 'METRIQ_INGEST_KEY is not set for this account. setx METRIQ_INGEST_KEY "..." and sign out and in.' 'Red'
  exit 2
}
if (-not $settings.endpoint) { Write-Line 'The configuration has no endpoint.' 'Red'; exit 2 }

$seen = @{}
if ((Test-Path $StateFile) -and -not $All) {
  (Get-Content $StateFile -Raw | ConvertFrom-Json).PSObject.Properties |
    ForEach-Object { $seen[$_.Name] = $_.Value }
}

# ---------------------------------------------------------------- helpers

# Excel holds an exclusive lock on an open workbook, and the plant's files are open all
# morning. Copying to a temporary file gets past it; if the copy also fails the file is
# genuinely unreadable and the source is skipped rather than the run abandoned.
function Copy-Readable([string] $path) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('mm-' + [Guid]::NewGuid().ToString('N') + [IO.Path]::GetExtension($path))
  try { Copy-Item -LiteralPath $path -Destination $temp -Force; return $temp }
  catch { return $null }
}

# Which morning a file fills. A DOR is read *for* a date; the file cannot always say which,
# so the source declares where the date comes from.
function Resolve-Date($source, [IO.FileInfo] $file) {
  switch ($source.dateFrom) {
    'filename' {
      # 2026-02-11, 2026_02_11 and 20260211 all appear in these names.
      if ($file.Name -match '(20\d{2})[-_]?(\d{2})[-_]?(\d{2})') {
        return '{0}-{1}-{2}' -f $Matches[1], $Matches[2], $Matches[3]
      }
      return $file.LastWriteTime.ToString('yyyy-MM-dd')
    }
    'modified' { return $file.LastWriteTime.ToString('yyyy-MM-dd') }
    default    { return (Get-Date).ToString('yyyy-MM-dd') }
  }
}

# ---------------------------------------------------------------- the run

$sent = 0; $skipped = 0; $problems = 0

foreach ($source in $settings.sources) {
  if ($source.enabled -eq $false) { continue }

  if (-not (Test-Path $source.folder)) {
    # A mapped drive does not exist for a task running as SYSTEM, and OneDrive is not
    # mounted until the account signs in. Both look exactly like this, so say so.
    Write-Line "$($source.name): $($source.folder) is not reachable from this account." 'Yellow'
    $problems++
    continue
  }

  $files = @(Get-ChildItem -LiteralPath $source.folder -Filter $source.match -File -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending)
  if ($source.newestOnly -ne $false) { $files = @($files | Select-Object -First 1) }
  if (-not $files -or $files.Count -eq 0) {
    Write-Line "$($source.name): nothing matching $($source.match)." 'Yellow'
    continue
  }

  foreach ($file in $files) {
    $readable = Copy-Readable $file.FullName
    if (-not $readable) {
      Write-Line "$($source.name): $($file.Name) is locked and could not be copied." 'Yellow'
      $problems++
      continue
    }

    try {
      # Hashing the contents rather than trusting the timestamp: OneDrive rewrites
      # LastWriteTime on sync, and a file that re-synced unchanged is not a new morning.
      $hash = (Get-FileHash -LiteralPath $readable -Algorithm SHA256).Hash
      $identity = '{0}|{1}' -f $source.name, $file.Name
      if ($seen[$identity] -eq $hash) {
        $skipped++
        continue
      }

      $date = Resolve-Date $source $file
      if ($WhatIf) {
        Write-Line "$($source.name): would send $($file.Name) for $date." 'Cyan'
        continue
      }

      $headers = @{
        'x-metriq-key'      = $key
        'x-metriq-location' = $source.location
        'x-metriq-filename' = $file.Name
        'x-metriq-date'     = $date
        'content-type'          = 'application/octet-stream'
      }
      $answer = Invoke-RestMethod -Uri $settings.endpoint -Method Post -Headers $headers `
                                  -InFile $readable -TimeoutSec 300

      $wrote = @($answer.wrote).Count
      $missed = @($answer.failed).Count
      Write-Line ("$($source.name): $($file.Name) → $wrote morning(s)" +
                  $(if ($missed) { ", $missed refused" } else { '' }) +
                  $(if ($answer.unknownOperators) { ", operators not on file: $($answer.unknownOperators -join ', ')" } else { '' })) `
                 $(if ($missed) { 'Yellow' } else { 'Green' })
      foreach ($note in $answer.notes) { Write-Line "    $note" 'DarkGray' }
      foreach ($bad in $answer.failed) { Write-Line "    $($bad.date): $($bad.error)" 'Yellow' }

      # Recorded only after the endpoint accepted it, so a failed run retries next morning
      # rather than marking the file done and going quiet.
      if ($missed -eq 0) { $seen[$identity] = $hash }
      $sent++
    }
    catch {
      # The endpoint says *why* in the body — "no ZIP directory", "sheets are …", a tab
      # that got renamed. PowerShell throws away everything but the status line unless you
      # go and read the stream, and the status line alone is no use at 7am.
      # Windows PowerShell 5.1 leaves the body on the response stream; PowerShell 7 has
      # already read it into ErrorDetails. Both are tried, because which one is installed
      # depends on the PC.
      $detail = $_.Exception.Message
      $raw = $_.ErrorDetails.Message
      if (-not $raw) {
        try {
          $stream = $_.Exception.Response.GetResponseStream()
          $stream.Position = 0
          $raw = (New-Object IO.StreamReader($stream)).ReadToEnd()
        } catch { }
      }
      if ($raw) {
        try {
          $body = $raw | ConvertFrom-Json
          if ($body.notes)     { $detail = $body.notes -join '; ' }
          elseif ($body.error) { $detail = $body.error }
        } catch { }
      }
      Write-Line "$($source.name): $($file.Name) — $detail" 'Red'
      $problems++
    }
    finally {
      Remove-Item -LiteralPath $readable -Force -ErrorAction SilentlyContinue
    }
  }
}

if (-not $WhatIf) {
  $null = New-Item -ItemType Directory -Force -Path (Split-Path $StateFile)
  $seen | ConvertTo-Json -Depth 3 | Set-Content -Path $StateFile -Encoding UTF8
}

Write-Line "Done. $sent sent, $skipped unchanged, $problems problem(s)." $(if ($problems) { 'Yellow' } else { 'Green' })
exit $(if ($problems) { 1 } else { 0 })
