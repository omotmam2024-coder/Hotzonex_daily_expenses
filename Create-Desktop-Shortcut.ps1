# Run this once to put a "Hotzonex" shortcut on your Desktop.
# Right-click this file -> "Run with PowerShell" (or run it from a PowerShell window).
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$target     = Join-Path $projectDir 'Hotzonex.vbs'
$desktop    = [Environment]::GetFolderPath('Desktop')
$lnkPath    = Join-Path $desktop 'Hotzonex.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath       = "$env:WINDIR\System32\wscript.exe"
$shortcut.Arguments        = "`"$target`""
$shortcut.WorkingDirectory = $projectDir
$shortcut.Description       = 'Hotzonex Daily Expenses'
# Use the Edge app icon if present, otherwise the default
$edge = 'C:\Program Files (x86)\Microsoft Edge\Application\msedge.exe'
if (Test-Path $edge) { $shortcut.IconLocation = "$edge,0" }
$shortcut.Save()

Write-Host "Done. A 'Hotzonex' shortcut is on your Desktop - double-click it to open the app." -ForegroundColor Green
