param(
  [string]$RepoPath = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedBranch = 'feature/gantt-period-view-v1'
$LogPath = Join-Path $env:USERPROFILE 'Desktop\QLTD_UI_POLISH_ACTIVATION.txt'
$Timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Log {
  param([string]$Message = '')
  Write-Host $Message
  [System.IO.File]::AppendAllText($LogPath, $Message + [Environment]::NewLine, $Utf8NoBom)
}

[System.IO.File]::WriteAllText($LogPath, '', $Utf8NoBom)
Write-Log 'QLTD - KICH HOAT GIAO DIEN MENU ACTIVE VA KPI ICON'
Write-Log ("Time: {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Log ("RepoPath: {0}" -f $RepoPath)
Write-Log ''

if (-not (Test-Path $RepoPath)) {
  throw "Khong tim thay thu muc repo: $RepoPath"
}

Set-Location $RepoPath

$Branch = (git branch --show-current).Trim()
Write-Log ("Current branch: {0}" -f $Branch)
if ($Branch -ne $ExpectedBranch) {
  throw "Sai branch. Can dung '$ExpectedBranch', hien tai la '$Branch'."
}

$InitialStatus = @(git status --short)
if ($InitialStatus.Count -gt 0) {
  Write-Log 'STOP: Repo dang co thay doi chua commit:'
  $InitialStatus | ForEach-Object { Write-Log $_ }
  throw 'Repo khong sach. Khong tu dong sua index.html.'
}

$HostDir = Join-Path $RepoPath 'firebase-hosting-dev'
$IndexPath = Join-Path $HostDir 'index.html'
$CssPath = Join-Path $HostDir 'ui-polish.css'
$JsPath = Join-Path $HostDir 'ui-polish.js'

@($IndexPath, $CssPath, $JsPath) | ForEach-Object {
  if (-not (Test-Path $_)) {
    throw "Thieu file bat buoc: $_"
  }
}

$BackupPath = Join-Path $env:USERPROFILE ("Desktop\QLTD_index_before_ui_polish_{0}.html" -f $Timestamp)
Copy-Item -Path $IndexPath -Destination $BackupPath -Force
Write-Log ("Backup index: {0}" -f $BackupPath)

$IndexContent = [System.IO.File]::ReadAllText($IndexPath)
$NewLine = if ($IndexContent.Contains("`r`n")) { "`r`n" } else { "`n" }
$CssRef = '    <link rel="stylesheet" href="./ui-polish.css?v=UI_KPI_ICON_1">'
$JsRef = '    <script src="./ui-polish.js?v=UI_KPI_ICON_1" defer></script>'

if (-not $IndexContent.Contains($CssRef)) {
  if (-not $IndexContent.Contains('</head>')) {
    throw 'Khong tim thay the dong </head> trong index.html.'
  }
  $IndexContent = $IndexContent.Replace('  </head>', $CssRef + $NewLine + '  </head>')
  Write-Log 'Da them ui-polish.css vao index.html.'
} else {
  Write-Log 'ui-polish.css da ton tai; khong them trung.'
}

if (-not $IndexContent.Contains($JsRef)) {
  if (-not $IndexContent.Contains('</body>')) {
    throw 'Khong tim thay the dong </body> trong index.html.'
  }
  $IndexContent = $IndexContent.Replace('  </body>', $JsRef + $NewLine + '  </body>')
  Write-Log 'Da them ui-polish.js vao index.html.'
} else {
  Write-Log 'ui-polish.js da ton tai; khong them trung.'
}

[System.IO.File]::WriteAllText($IndexPath, $IndexContent, $Utf8NoBom)

try {
  $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($NodeCommand) {
    Write-Log ''
    Write-Log '===== NODE SYNTAX CHECK ====='
    (& node --check $JsPath 2>&1) | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) {
      throw 'ui-polish.js loi cu phap.'
    }
    Write-Log 'PASS: ui-polish.js hop le.'
  } else {
    Write-Log 'WARNING: Khong tim thay Node.js; bo qua node --check.'
  }

  $FinalIndex = [System.IO.File]::ReadAllText($IndexPath)
  $CssCount = ([regex]::Matches($FinalIndex, [regex]::Escape('./ui-polish.css?v=UI_KPI_ICON_1'))).Count
  $JsCount = ([regex]::Matches($FinalIndex, [regex]::Escape('./ui-polish.js?v=UI_KPI_ICON_1'))).Count
  if ($CssCount -ne 1 -or $JsCount -ne 1) {
    throw "So lan tham chieu khong hop le: CSS=$CssCount; JS=$JsCount"
  }

  Write-Log ''
  Write-Log '===== GIT DIFF CHECK ====='
  (& git diff --check 2>&1) | ForEach-Object { Write-Log $_ }
  if ($LASTEXITCODE -ne 0) {
    throw 'git diff --check khong dat.'
  }
  Write-Log 'PASS: git diff --check.'

  $FinalStatus = @(git status --short)
  $Unexpected = @($FinalStatus | Where-Object { $_ -notmatch '^ M firebase-hosting-dev/index\.html$' })
  if ($Unexpected.Count -gt 0) {
    Write-Log 'STOP: Phat hien thay doi ngoai index.html:'
    $Unexpected | ForEach-Object { Write-Log $_ }
    throw 'Phat hien thay doi ngoai pham vi.'
  }

  Write-Log ''
  Write-Log '===== CHANGED FILES ====='
  $FinalStatus | ForEach-Object { Write-Log $_ }

  Write-Log ''
  Write-Log '===== INDEX DIFF ====='
  (& git diff -- firebase-hosting-dev/index.html 2>&1) | ForEach-Object { Write-Log $_ }

  Write-Log ''
  Write-Log 'KET QUA: Da kich hoat UI polish tai local repo.'
  Write-Log 'CHUA commit, CHUA push, CHUA deploy Firebase.'
  Write-Log ("Rollback local: Copy-Item -Path '{0}' -Destination '{1}' -Force" -f $BackupPath, $IndexPath)
} catch {
  Copy-Item -Path $BackupPath -Destination $IndexPath -Force
  Write-Log ("LOI: {0}" -f $_.Exception.Message)
  Write-Log 'Da rollback index.html tu file backup tren Desktop.'
  throw
}

Invoke-Item $LogPath
