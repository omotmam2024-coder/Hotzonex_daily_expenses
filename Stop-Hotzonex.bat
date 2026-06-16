@echo off
REM Stops the Hotzonex background server (frees port 4100).
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }; Write-Host 'Hotzonex stopped.' } else { Write-Host 'Hotzonex was not running.' }"
timeout /t 2 >nul
