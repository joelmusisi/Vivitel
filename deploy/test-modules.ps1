# One-at-a-time then simultaneous module verification (Track/Control/Analyse/Deliver)
$ErrorActionPreference = "Continue"
$root = Join-Path $PSScriptRoot "..\backend" | Resolve-Path
Set-Location $root
New-Item -ItemType Directory -Force -Path "data\module-test" | Out-Null
if (-not (Test-Path "build\package.json")) {
  Set-Content "build\package.json" '{"type":"commonjs"}' -Encoding ascii
}

$modules = @(
  @{ Name="track";   Role="track";   Port=18781 },
  @{ Name="control"; Role="control"; Port=18782 },
  @{ Name="analyse"; Role="analyse"; Port=18783 },
  @{ Name="deliver"; Role="deliver"; Port=18784 }
)

$pids = @{}

function Start-Mod($m) {
  $db = Join-Path $root "data\module-test\$($m.Name).sqlite"
  $envBlock = @(
    "set NODE_ENV=production",
    "set PORT=$($m.Port)",
    "set VIVI_SERVICE_ROLE=$($m.Role)",
    "set DB_PATH=$db",
    "set REQUIRE_PERSISTENT_DB=false",
    "set VPS_RATE_LIMIT_ENABLED=false",
    "set API_KEY=module-test-key",
    "set VPS_MAX_IN_FLIGHT=200",
    "node `"$root\build\vps_server.js`""
  ) -join " && "
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $envBlock -WorkingDirectory $root -PassThru -WindowStyle Hidden
  $pids[$m.Name] = $p.Id
  return $p.Id
}

function Stop-Mod([string]$name) {
  $id = $pids[$name]
  if ($id) {
    # Kill node children of this cmd tree
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -like "*vps_server.js*" -and $_.CommandLine -like "*$name*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    # Fallback: kill by listening port
  }
}

function Stop-Port([int]$port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

function Curl-Code([int]$port, [string]$path) {
  $out = & curl.exe -s -o "$env:TEMP\vivi-probe-body.txt" -w "%{http_code}" "http://127.0.0.1:$port$path"
  $body = ""
  if (Test-Path "$env:TEMP\vivi-probe-body.txt") { $body = Get-Content "$env:TEMP\vivi-probe-body.txt" -Raw -ErrorAction SilentlyContinue }
  return @{ Code = [int]$out; Body = [string]$body }
}

function Wait-Live([int]$port, [int]$sec=35) {
  $end = (Get-Date).AddSeconds($sec)
  while ((Get-Date) -lt $end) {
    $r = Curl-Code $port "/health/live"
    if ($r.Code -eq 200) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Expect($label, $code, $want) {
  $ok = $want -contains $code
  Write-Host ("[{0}] {1} -> {2} (want {3})" -f ($(if($ok){"PASS"}else{"FAIL"}), $label, $code, ($want -join "|")))
  return $ok
}

# Free ports
foreach ($m in $modules) { Stop-Port $m.Port }
# Also stop prior control on 18791 if still up
Stop-Port 18791

$solo = @{}

Write-Host "`n=== PHASE 1: EACH MODULE ALONE ===`n"
foreach ($m in $modules) {
  Write-Host "---- $($m.Name) on $($m.Port) ----"
  Stop-Port $m.Port
  Start-Mod $m | Out-Null
  if (-not (Wait-Live $m.Port)) {
    Write-Host "[FAIL] $($m.Name) failed to start"
    $solo[$m.Name] = $false
    Stop-Port $m.Port
    continue
  }
  $ok = $true
  $live = Curl-Code $m.Port "/health/live"
  $ready = Curl-Code $m.Port "/health/ready"
  $ok = (Expect "$($m.Name) live" $live.Code @(200)) -and $ok
  $ok = (Expect "$($m.Name) ready" $ready.Code @(200)) -and $ok
  if ($live.Body -match ('"serviceRole"\s*:\s*"' + $m.Role + '"')) {
    Write-Host "[PASS] $($m.Name) serviceRole=$($m.Role)"
  } else {
    Write-Host "[FAIL] $($m.Name) serviceRole body=$($live.Body)"
    $ok = $false
  }

  switch ($m.Role) {
    "track" {
      $ok = (Expect "track /health/tcp" (Curl-Code $m.Port "/health/tcp").Code @(200)) -and $ok
      $ok = (Expect "track lacks /deliver/state" (Curl-Code $m.Port "/deliver/state").Code @(404)) -and $ok
      $ok = (Expect "track lacks /rbac/users" (Curl-Code $m.Port "/rbac/users").Code @(404)) -and $ok
      $ok = (Expect "track owns /telemetry/lookup" (Curl-Code $m.Port "/telemetry/lookup").Code @(400,401)) -and $ok
    }
    "control" {
      $ok = (Expect "control /rbac/users" (Curl-Code $m.Port "/rbac/users").Code @(400,401)) -and $ok
      $ok = (Expect "control lacks /deliver/state" (Curl-Code $m.Port "/deliver/state").Code @(404)) -and $ok
      $ok = (Expect "control lacks /telemetry/lookup" (Curl-Code $m.Port "/telemetry/lookup").Code @(404)) -and $ok
    }
    "analyse" {
      $ok = (Expect "analyse /telemetry/lookup" (Curl-Code $m.Port "/telemetry/lookup").Code @(400,401)) -and $ok
      $ok = (Expect "analyse /metrics" (Curl-Code $m.Port "/metrics").Code @(200)) -and $ok
      $ok = (Expect "analyse lacks /rbac/users" (Curl-Code $m.Port "/rbac/users").Code @(404)) -and $ok
      $ok = (Expect "analyse lacks /deliver/state" (Curl-Code $m.Port "/deliver/state").Code @(404)) -and $ok
    }
    "deliver" {
      $ok = (Expect "deliver /deliver/state" (Curl-Code $m.Port "/deliver/state").Code @(200,401)) -and $ok
      $ok = (Expect "deliver /deliver/health" (Curl-Code $m.Port "/deliver/health").Code @(200,401)) -and $ok
      $ok = (Expect "deliver lacks /rbac/users" (Curl-Code $m.Port "/rbac/users").Code @(404)) -and $ok
    }
  }
  $solo[$m.Name] = $ok
  Write-Host "Stopping $($m.Name)..."
  Stop-Port $m.Port
  Start-Sleep -Seconds 1
}

Write-Host "`n=== PHASE 2: ALL FOUR SIMULTANEOUS ===`n"
foreach ($m in $modules) { Stop-Port $m.Port; Start-Mod $m | Out-Null }
$allUp = $true
foreach ($m in $modules) {
  $up = Wait-Live $m.Port
  Write-Host ("[{0}] {1} live" -f ($(if($up){"PASS"}else{"FAIL"}), $m.Name))
  if (-not $up) { $allUp = $false }
}

$sim = $allUp
if ($allUp) {
  foreach ($m in $modules) {
    $sim = (Expect "sim $($m.Name) live" (Curl-Code $m.Port "/health/live").Code @(200)) -and $sim
    $sim = (Expect "sim $($m.Name) ready" (Curl-Code $m.Port "/health/ready").Code @(200)) -and $sim
  }
  $sim = (Expect "sim track /health/tcp" (Curl-Code 18781 "/health/tcp").Code @(200)) -and $sim
  $sim = (Expect "sim control /rbac" (Curl-Code 18782 "/rbac/users").Code @(400,401)) -and $sim
  $sim = (Expect "sim analyse /telemetry" (Curl-Code 18783 "/telemetry/lookup").Code @(400,401)) -and $sim
  $sim = (Expect "sim deliver /deliver/state" (Curl-Code 18784 "/deliver/state").Code @(200,401)) -and $sim
  $sim = (Expect "sim track no /rbac" (Curl-Code 18781 "/rbac/users").Code @(404)) -and $sim
  $sim = (Expect "sim control no /deliver" (Curl-Code 18782 "/deliver/state").Code @(404)) -and $sim
  $sim = (Expect "sim deliver no /rbac" (Curl-Code 18784 "/rbac/users").Code @(404)) -and $sim
  $sim = (Expect "sim analyse no /deliver" (Curl-Code 18783 "/deliver/state").Code @(404)) -and $sim
}

Write-Host "`n=== CLEANUP ==="
foreach ($m in $modules) { Stop-Port $m.Port }
Stop-Port 18791

Write-Host "`n=== SUMMARY ==="
foreach ($m in $modules) {
  Write-Host ("solo {0}: {1}" -f $m.Name, ($(if($solo[$m.Name]){"PASS"}else{"FAIL"})))
}
Write-Host ("simultaneous: {0}" -f ($(if($sim){"PASS"}else{"FAIL"})))
$fail = @($modules | Where-Object { -not $solo[$_.Name] }).Count
if ($fail -gt 0 -or -not $sim) { exit 1 } else { exit 0 }
