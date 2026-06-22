param(
  [string]$RepoPath = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedBranch = 'feature/gantt-period-view-v1'
$LogPath = Join-Path $env:USERPROFILE 'Desktop\QLTD_UI_POLISH_ACTIVATION.txt'
$Timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'

function Write-Log {
  param([string]$Message = '')
  $Message | Tee-Object -FilePath $LogPath -Append
}

Set-Content -Path $LogPath -Value '' -Encoding UTF8
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

$HostDir = Join-Path $RepoPath 'firebase-hosting-dev'
$IndexPath = Join-Path $HostDir 'index.html'
$PreviewPath = Join-Path $HostDir 'index.ui-polish.preview.html'
$CssPath = Join-Path $HostDir 'ui-polish.css'
$JsPath = Join-Path $HostDir 'ui-polish.js'

@($IndexPath, $PreviewPath, $CssPath, $JsPath) | ForEach-Object {
  if (-not (Test-Path $_)) {
    throw "Thieu file bat buoc: $_"
  }
}

$BackupPath = Join-Path $HostDir ("index.before-ui-polish.{0}.html" -f $Timestamp)
Copy-Item -Path $IndexPath -Destination $BackupPath -Force
Write-Log ("Backup index: {0}" -f $BackupPath)

Copy-Item -Path $PreviewPath -Destination $IndexPath -Force
Write-Log 'Da thay index.html bang ban kich hoat ui-polish.'

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($NodeCommand) {
  Write-Log ''
  Write-Log '===== NODE SYNTAX CHECK ====='
  (& node --check $JsPath 2>&1) | ForEach-Object { Write-Log $_ }
  if ($LASTEXITCODE -ne 0) {
    Copy-Item -Path $BackupPath -Destination $IndexPath -Force
    throw 'ui-polish.js loi cu phap. Da rollback index.html.'
  }
  Write-Log 'PASS: ui-polish.js hop le.'
} else {
  Write-Log 'WARNING: Khong tim thay Node.js; bo qua node --check.'
}

Write-Log ''
Write-Log '===== GIT DIFF CHECK ====='
(& git diff --check 2>&1) | ForEach-Object { Write-Log $_ }
if ($LASTEXITCODE -ne 0) {
  Copy-Item -Path $BackupPath -Destination $IndexPath -Force
  throw 'git diff --check khong dat. Da rollback index.html.'
}
Write-Log 'PASS: git diff --check.'

Write-Log ''
Write-Log '===== CHANGED FILES ====='
(& git status --short 2>&1) | ForEach-Object { Write-Log $_ }

Write-Log ''
Write-Log '===== INDEX DIFF ====='
(& git diff -- firebase-hosting-dev/index.html 2>&1) | ForEach-Object { Write-Log $_ }

Write-Log ''
Write-Log 'KET QUA: Da kich hoat UI polish tai local repo.'
Write-Log 'CHUA commit, CHUA push, CHUA deploy Firebase.'
Write-Log ("Rollback local: Copy-Item -Path '{0}' -Destination '{1}' -Force" -f $BackupPath, $IndexPath)

Invoke-Item $LogPath
