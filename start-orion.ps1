param(
  [int]$Port = 4174,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$selectedPort = $Port

function Test-OrionServer {
  param([int]$TestPort)

  try {

    $tileUrl = "http://127.0.0.1:$TestPort/gibs/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2026-05-12/GoogleMapsCompatible_Level9/4/12/5.jpg"

    $response = Invoke-WebRequest `
      -Uri $tileUrl `
      -UseBasicParsing `
      -TimeoutSec 2

    return (
      $response.StatusCode -eq 200 -and
      $response.Headers["X-Orion-Tile-Fallback"] -eq "transparent"
    )

  }
  catch {

    return $false

  }
}

# FIND AVAILABLE PORT OR REUSE EXISTING ORION INSTANCE

while (Get-NetTCPConnection -LocalPort $selectedPort -ErrorAction SilentlyContinue) {

  if (Test-OrionServer -TestPort $selectedPort) {

    $url = "http://127.0.0.1:$selectedPort/"

    if (-not $NoOpen) {
      Start-Process $url
    }

    Write-Host ""
    Write-Host "Project Orion is already running at $url" -ForegroundColor Cyan
    Write-Host ""

    return
  }

  $selectedPort++

}

# FIND PYTHON

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$pythonArgs = @("orion_server.py", "$selectedPort")

if (-not $pythonCommand) {

  $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
  $pythonArgs = @("-3", "orion_server.py", "$selectedPort")

}

if (-not $pythonCommand) {

  throw "Python was not found. Install Python or run this folder with any local static web server."

}

# LOG FILES

$outLog = Join-Path $root "server.out.log"
$errLog = Join-Path $root "server.err.log"

$url = "http://127.0.0.1:$selectedPort/"

# CLEAN OLD LOGS

Remove-Item $outLog -ErrorAction SilentlyContinue
Remove-Item $errLog -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Starting Project Orion..." -ForegroundColor Cyan
Write-Host "Port: $selectedPort" -ForegroundColor DarkGray
Write-Host ""

# START SERVER

$process = Start-Process `
  -FilePath $pythonCommand.Source `
  -ArgumentList $pythonArgs `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

# WAIT FOR SERVER

$started = $false

for ($attempt = 1; $attempt -le 30; $attempt++) {

  Start-Sleep -Milliseconds 350

  try {

    $response = Invoke-WebRequest `
      -Uri $url `
      -UseBasicParsing `
      -TimeoutSec 2

    if ($response.StatusCode -eq 200) {

      $started = $true
      break

    }

  }
  catch {

    # keep waiting

  }

}

# FAILED STARTUP

if (-not $started) {

  $errorText = Get-Content `
    $errLog `
    -ErrorAction SilentlyContinue |
    Select-Object -Last 30

  Write-Host ""
  Write-Host "Project Orion failed to start." -ForegroundColor Red
  Write-Host ""

  throw "Last server log lines:`n$errorText"

}

# OPEN BROWSER

if (-not $NoOpen) {

  Start-Process $url

}

# SUCCESS

Write-Host ""
Write-Host "Project Orion is running." -ForegroundColor Green
Write-Host "URL: $url" -ForegroundColor Cyan
Write-Host "Server PID: $($process.Id)" -ForegroundColor DarkGray
Write-Host ""