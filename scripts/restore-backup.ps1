param(
    [string]$BackupName,
    [switch]$Latest,
    [switch]$List,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'

function Get-PosPilotDataDir {
    if ($env:POSPILOT_DB_PATH) {
        $dbPath = $env:POSPILOT_DB_PATH
        return [System.IO.Path]::GetDirectoryName($dbPath)
    }

    $appData = [Environment]::GetFolderPath('ApplicationData')
    return Join-Path $appData 'PosPilot\data'
}

function Get-BackupDir {
    $dataDir = Get-PosPilotDataDir
    return Join-Path $dataDir 'backups'
}

function Get-DbPath {
    if ($env:POSPILOT_DB_PATH) {
        return $env:POSPILOT_DB_PATH
    }

    $dataDir = Get-PosPilotDataDir
    return Join-Path $dataDir 'pospilot.db'
}

function Get-BackupFiles {
    $backupDir = Get-BackupDir
    if (-not (Test-Path $backupDir)) { return @() }

    Get-ChildItem -Path $backupDir -File |
        Where-Object { $_.Name -match '^pospilot-\d{8}-\d{6}(?:-\d+)?\.db$' } |
        Sort-Object Name -Descending
}

$databasePath = Get-DbPath
$backupDir = Get-BackupDir

if ($List) {
    $files = Get-BackupFiles
    if (-not $files -or $files.Count -eq 0) {
        Write-Host "No backup snapshots found in: $backupDir"
        exit 0
    }

    Write-Host "Backup snapshots in $backupDir"
    for ($i = 0; $i -lt $files.Count; $i++) {
        $marker = if ($i -eq 0) { '→ (newest) ' } else { '           ' }
        Write-Host "$marker$($files[$i].Name)"
    }
    exit 0
}

$files = Get-BackupFiles
if (-not $files -or $files.Count -eq 0) {
    Write-Error "No backups found in $backupDir. Nothing to restore."
    exit 1
}

if ($Latest) {
    $selectedBackup = $files[0].Name
} elseif (-not [string]::IsNullOrWhiteSpace($BackupName)) {
    $match = $files | Where-Object { $_.Name -eq $BackupName }
    if (-not $match) {
        Write-Error "Backup '$BackupName' not found in $backupDir. Use -List to view available snapshots."
        exit 1
    }
    $selectedBackup = $match[0].Name
} else {
    $selectedBackup = $files[0].Name
}

$source = Join-Path $backupDir $selectedBackup

if (-not (Test-Path $databasePath)) {
    Write-Error "Live database not found at: $databasePath"
    exit 1
}

if (-not (Test-Path $source)) {
    Write-Error "Backup file is missing: $source"
    exit 1
}

$safetyFile = "$databasePath.pre-restore-$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))"
Write-Host "[restore] Will replace: $databasePath"
Write-Host "[restore] With snapshot: $source"
Write-Host "[restore] Safety copy: $safetyFile"

if (-not $Yes) {
    Write-Host "[restore] Make sure the PosPilot app is CLOSED before continuing."
    $answer = Read-Host "Type RESTORE to continue"
    if ($answer -ne 'RESTORE') {
        Write-Host "[restore] Aborted — nothing was changed."
        exit 0
    }
}

Copy-Item -Path $databasePath -Destination $safetyFile -Force
Copy-Item -Path $source -Destination $databasePath -Force

foreach ($suffix in @('-wal', '-shm')) {
    $walPath = "$databasePath$suffix"
    if (Test-Path $walPath) {
        Remove-Item $walPath -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "[restore] Done. Database restored from $selectedBackup."
Write-Host "[restore] Start PosPilot normally."
