[CmdletBinding()]
param(
  [string]$PlayerUrl = "",
  [switch]$SkipInstall,
  [switch]$BuildFirst,
  [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$agentDir = Join-Path $repoRoot "agent"
$playerDir = Join-Path $repoRoot "player"
$logsDir = Join-Path $repoRoot "sim-logs"
$agentHealthUrl = "http://localhost:3001/health"
$playerUiUrl = "http://localhost:3002"
$launcherLog = Join-Path $logsDir "launcher.log"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
Set-Content -LiteralPath $launcherLog -Value ("[{0}] Simulator gestart" -f (Get-Date -Format s))

function Write-Step([string]$message) {
  Write-Host ""
  Write-Host $message -ForegroundColor Cyan
  Add-Content -LiteralPath $launcherLog -Value ("[{0}] {1}" -f (Get-Date -Format s), $message)
}

function Assert-Command([string]$commandName) {
  if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
    throw "Command not found: $commandName"
  }
}

function Get-PortUsage([int]$port) {
  $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq 'Listen' }

  if (-not $connections) {
    return $null
  }

  $processId = ($connections | Select-Object -First 1 -ExpandProperty OwningProcess)
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue

  return [PSCustomObject]@{
    Port = $port
    ProcessId = $processId
    CommandLine = $process.CommandLine
  }
}

function Assert-PortAvailable([int]$port, [string]$serviceName) {
  $usage = Get-PortUsage -port $port

  if ($null -ne $usage) {
    $message = "$serviceName kan niet starten: poort $port is al in gebruik door PID $($usage.ProcessId)."
    if ($usage.CommandLine) {
      $message = "$message`nCommandLine: $($usage.CommandLine)"
    }
    throw $message
  }
}

function Ensure-Install([string]$workingDirectory) {
  if ($SkipInstall) {
    return
  }

  $nodeModules = Join-Path $workingDirectory "node_modules"
  Write-Host "npm install -> $workingDirectory"

  if (Test-Path $nodeModules) {
    Push-Location $workingDirectory
    try {
      npm install | Out-Host
    }
    finally {
      Pop-Location
    }
    return
  }

  Push-Location $workingDirectory
  try {
    npm install | Out-Host
  }
  finally {
    Pop-Location
  }
}

function Invoke-Build([string]$workingDirectory) {
  Push-Location $workingDirectory
  try {
    npm run build | Out-Host
  }
  finally {
    Pop-Location
  }
}

function Start-ProcessWindow([string]$title, [string]$workingDirectory, [string]$command, [string]$logFile) {
  $escapedWorkingDirectory = $workingDirectory.Replace("'", "''")
  $escapedCommand = $command.Replace("'", "''")
  $escapedLogFile = $logFile.Replace("'", "''")
  $psCommand = @"
`$Host.UI.RawUI.WindowTitle = '$title'
Set-Location '$escapedWorkingDirectory'
& { $escapedCommand } *>&1 | Tee-Object -FilePath '$escapedLogFile' -Append
"@

  Start-Process powershell -ArgumentList "-NoExit", "-Command", $psCommand | Out-Null
}

function Wait-ForUrl([string]$url, [int]$timeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  $fallbackUrl = $url -replace 'localhost', '127.0.0.1'

  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
      return $true
    }
    catch {
      try {
        Invoke-WebRequest -Uri $fallbackUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
      }
      catch {
        Start-Sleep -Milliseconds 750
      }
    }
  }

  return $false
}

function Activate-Agent([string]$url) {
  $payload = @{ playerUrl = $url } | ConvertTo-Json -Compress
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:3001/activate" `
    -ContentType "application/json" `
    -Body $payload
}

Assert-Command "node"
Assert-Command "npm"

if (-not (Test-Path $agentDir)) {
  throw "Map niet gevonden: $agentDir"
}

if (-not (Test-Path $playerDir)) {
  throw "Map niet gevonden: $playerDir"
}

Write-Step "Windows Raspberry Pi simulatie starten"
Write-Host "Repo: $repoRoot"
Write-Host "Agent: $agentDir"
Write-Host "Player: $playerDir"

Write-Step "Dependencies controleren"
Ensure-Install -workingDirectory $agentDir
Ensure-Install -workingDirectory $playerDir

if ($BuildFirst) {
  Write-Step "Agent en player builden"
  Invoke-Build -workingDirectory $agentDir
  Invoke-Build -workingDirectory $playerDir
}

Write-Step "Poorten controleren"
Assert-PortAvailable -port 3001 -serviceName "Agent"
Assert-PortAvailable -port 3002 -serviceName "Player"

Write-Step "Agent venster starten"
Start-ProcessWindow `
  -title "Weso Agent Simulator" `
  -workingDirectory $agentDir `
  -command "npm run dev" `
  -logFile (Join-Path $logsDir "agent.log")

Write-Step "Player venster starten"
Start-ProcessWindow `
  -title "Weso Player Simulator" `
  -workingDirectory $playerDir `
  -command "npm run dev -- --host 0.0.0.0 --port 3002 --strictPort" `
  -logFile (Join-Path $logsDir "player.log")

Write-Step "Wachten op lokale services"
$agentReady = Wait-ForUrl -url $agentHealthUrl -timeoutSeconds 30
$playerReady = Wait-ForUrl -url $playerUiUrl -timeoutSeconds 30

if (-not $agentReady) {
  throw "Agent werd niet bereikbaar op $agentHealthUrl"
}

if (-not $playerReady) {
  Write-Step "Player startcontrole mislukt"
  Write-Host "Check ook:"
  Write-Host "- $logsDir\\player.log"
  throw "Player werd niet bereikbaar op $playerUiUrl"
}

if ($PlayerUrl) {
  Write-Step "Agent activeren met bestaande speler-URL"
  try {
    $activationResponse = Activate-Agent -url $PlayerUrl
    Write-Host "Activatie verstuurd naar lokale agent."
    $activationResponse |
      ConvertTo-Json -Depth 6 |
      Tee-Object -FilePath (Join-Path $logsDir "activation-response.json") | Out-Host
  } catch {
    $errorMessage = $_.Exception.Message
    Write-Step "Activatie mislukt"
    Set-Content -LiteralPath (Join-Path $logsDir "activation-error.txt") -Value $errorMessage
    Write-Host "Activatie naar de lokale agent is mislukt." -ForegroundColor Red
    Write-Host "Fout: $errorMessage" -ForegroundColor Red
    Write-Host "Check ook:"
    Write-Host "- $logsDir\\agent.log"
    Write-Host "- http://localhost:3001/logs"
    throw
  }
}
else {
  Write-Step "Geen activatie-URL opgegeven"
  Write-Host "Je kunt later activeren met:"
  Write-Host "Invoke-RestMethod -Method Post http://localhost:3001/activate -ContentType 'application/json' -Body '{""playerUrl"":""https://jouwdomein.nl/player/<screenId>?token=<deviceToken>""}'"
}

if (-not $NoBrowser) {
  Write-Step "Lokale player openen in browser"
  Start-Process $playerUiUrl | Out-Null
}

Write-Step "Simulator actief"
Write-Host "Agent health: $agentHealthUrl"
Write-Host "Player UI:    $playerUiUrl"
Write-Host "Logs map:     $logsDir"
Write-Host "Stoppen: sluit de twee PowerShell vensters handmatig."
