param(
    [string]$RepoPath = "D:\Appscript\1.QLTD",
    [string]$ExpectedBranch = "chore/phase1-agent-foundation"
)

$ErrorActionPreference = "Stop"
$LogPath = "$env:USERPROFILE\Desktop\QLTD_Phase1_CodebaseMemory_Setup.txt"
$InstallerUrl = "https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1"
$InstallerPath = Join-Path $env:TEMP "codebase-memory-mcp-install.ps1"
$InstallDir = "$env:LOCALAPPDATA\Programs\codebase-memory-mcp"
$ExePath = Join-Path $InstallDir "codebase-memory-mcp.exe"

Start-Transcript -Path $LogPath -Force | Out-Null

try {
    Write-Host "=== QLTD PHASE 1 - CODEBASE MEMORY MCP ===" -ForegroundColor Cyan
    Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host "RepoPath: $RepoPath"
    Write-Host "ExpectedBranch: $ExpectedBranch"
    Write-Host "LogPath: $LogPath"
    Write-Host ""

    if (-not (Test-Path $RepoPath)) {
        throw "Khong tim thay thu muc du an: $RepoPath"
    }

    if (-not (Test-Path (Join-Path $RepoPath ".git"))) {
        throw "Thu muc khong phai Git repository: $RepoPath"
    }

    Push-Location $RepoPath
    try {
        $CurrentBranch = (git branch --show-current).Trim()
        $Status = git status --short
        $Remote = git remote get-url origin

        Write-Host "Current branch: $CurrentBranch"
        Write-Host "Remote: $Remote"
        Write-Host "Git status:"
        if ([string]::IsNullOrWhiteSpace(($Status -join ""))) {
            Write-Host "  CLEAN"
        } else {
            $Status | ForEach-Object { Write-Host "  $_" }
        }

        if ($CurrentBranch -ne $ExpectedBranch) {
            throw "Dang o branch '$CurrentBranch', khong phai '$ExpectedBranch'. Dung lai de tranh cai nham branch."
        }
    }
    finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "Tai installer chinh thuc tu DeusData/codebase-memory-mcp..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $InstallerUrl -OutFile $InstallerPath -UseBasicParsing

    $InstallerHash = (Get-FileHash -Path $InstallerPath -Algorithm SHA256).Hash
    Write-Host "Installer: $InstallerPath"
    Write-Host "Installer SHA256: $InstallerHash"
    Write-Host ""

    Write-Host "Cai ban standard; installer se tu kiem tra checksum cua binary va cau hinh coding agents." -ForegroundColor Yellow
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $InstallerPath --standard

    if (-not (Test-Path $ExePath)) {
        throw "Khong tim thay binary sau khi cai: $ExePath"
    }

    $Version = & $ExePath --version 2>&1
    Write-Host ""
    Write-Host "Installed version: $Version" -ForegroundColor Green
    Write-Host "Binary: $ExePath"

    Write-Host ""
    Write-Host "=== KET QUA ===" -ForegroundColor Cyan
    Write-Host "PASS: Codebase Memory MCP da duoc cai dat va cau hinh agent."
    Write-Host "KHONG bat auto_index trong buoc nay."
    Write-Host "Buoc tiep theo: dong va mo lai Codex tai $RepoPath, sau do yeu cau: 'Doc AGENTS.md va index repository hien tai bang Codebase Memory MCP. Chi index, khong sua code.'"
}
catch {
    Write-Host ""
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Khong tiep tuc cai/index khi dieu kien an toan chua dat."
    exit 1
}
finally {
    Remove-Item $InstallerPath -Force -ErrorAction SilentlyContinue
    Stop-Transcript | Out-Null
    Start-Process notepad.exe $LogPath
}
