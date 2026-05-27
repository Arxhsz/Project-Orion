# Restart Orion Server Script
# This script stops any running Orion servers and starts a fresh instance

param(
    [int]$Port = 4173
)

Write-Host "=== Orion Server Restart ===" -ForegroundColor Cyan
Write-Host ""

# Stop any Python processes listening on Orion ports
Write-Host "Stopping existing Orion servers..." -ForegroundColor Yellow

$connections = Get-NetTCPConnection -LocalPort 4173,4174 -ErrorAction SilentlyContinue
foreach ($conn in $connections) {
    $pid = $conn.OwningProcess
    $port = $conn.LocalPort
    Write-Host "  Stopping process $pid on port $port..." -ForegroundColor Gray
    try {
        Stop-Process -Id $pid -Force -ErrorAction Stop
        Write-Host "  ✓ Stopped process $pid" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Failed to stop process $pid" -ForegroundColor Red
    }
}

# Wait a moment for ports to be released
Start-Sleep -Seconds 2

# Check if ports are now free
$stillUsed = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($stillUsed) {
    Write-Host ""
    Write-Host "Warning: Port $Port is still in use!" -ForegroundColor Red
    Write-Host "Please close any applications using this port and try again." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting Orion server on port $Port..." -ForegroundColor Yellow

# Start the server
$pythonPath = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pythonPath) {
    Write-Host "Error: Python not found in PATH" -ForegroundColor Red
    exit 1
}

Write-Host "  Using Python: $pythonPath" -ForegroundColor Gray
Write-Host ""

# Start the server in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python orion_server.py $Port"

# Wait a moment for server to start
Start-Sleep -Seconds 3

# Check if server started successfully
$serverRunning = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($serverRunning) {
    Write-Host "✓ Orion server started successfully on port $Port" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Open your browser to: http://127.0.0.1:$Port/" -ForegroundColor White
    Write-Host "  2. Press Ctrl+Shift+R to hard refresh and clear cache" -ForegroundColor White
    Write-Host "  3. Check the browser console (F12) for any errors" -ForegroundColor White
    Write-Host ""
    Write-Host "Chrome billboard fix and loading rebuild applied!" -ForegroundColor Green
} else {
    Write-Host "✗ Server failed to start" -ForegroundColor Red
    Write-Host "Check server.err.log for error messages" -ForegroundColor Yellow
}
