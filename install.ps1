# Kill any running node processes
Get-Process | Where-Object { $_.ProcessName -eq 'node' } | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Killed node processes"
Start-Sleep -Seconds 2

# Run pnpm install with local store to avoid sandbox issues
pnpm install --ignore-scripts --no-frozen-lockfile
Write-Host "pnpm install finished"
