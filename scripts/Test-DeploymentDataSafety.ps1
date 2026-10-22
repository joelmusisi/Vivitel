param(
  [string]$RepositoryRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = "Stop"

function Fail-SafetyCheck {
  param([string]$Message)
  throw "Deployment data safety check failed: $Message"
}

function Read-Text {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    Fail-SafetyCheck "Required deployment file is missing: $Path"
  }
  return Get-Content -LiteralPath $Path -Raw
}

function Read-Package {
  param([string]$Path)
  return Read-Text $Path | ConvertFrom-Json
}

function Assert-SafeDeployScripts {
  param(
    [string]$PackagePath,
    [object]$Package
  )

  $dangerous = @(
    '(?i)\bwrangler\s+d1\s+delete\b',
    '(?i)\bwrangler\s+kv(?::|\s+).*delete\b',
    '(?i)\bwrangler\s+pages\s+project\s+delete\b',
    '(?i)\bwrangler\s+r2\s+object\s+delete\b',
    '(?i)\b(drop\s+table|truncate\s+table)\b',
    '(?i)\bdelete\s+from\b',
    '(?i)\b(seed|purge|reset)[-_:]?(production|prod|data|settings|config)\b',
    '(?i)\blocalStorage\.clear\s*\(',
    '(?i)\bRemove-Item\b.*\b(data|\.env\.vps|ViviTEL)\b'
  )

  foreach ($property in $Package.scripts.PSObject.Properties) {
    if ($property.Name -notmatch '^(pre|post)?deploy($|:)') { continue }
    $command = [string]$property.Value
    foreach ($pattern in $dangerous) {
      if ($command -match $pattern) {
        Fail-SafetyCheck "$PackagePath script '$($property.Name)' contains a destructive operation."
      }
    }
  }
}

function Read-D1DatabaseId {
  param(
    [string]$Text,
    [string]$Binding
  )

  $escaped = [regex]::Escape($Binding)
  $match = [regex]::Match(
    $Text,
    "(?ms)\[\[d1_databases\]\](?:(?!\[\[).)*?binding\s*=\s*`"$escaped`"(?:(?!\[\[).)*?database_id\s*=\s*`"([^`"]+)`""
  )
  if (-not $match.Success) {
    Fail-SafetyCheck "Unable to find storage binding '$Binding'."
  }
  return $match.Groups[1].Value
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$rootPackagePath = Join-Path $root "package.json"
$backendPackagePath = Join-Path $root "backend\package.json"
$frontendPackagePath = Join-Path $root "frontend\package.json"

$rootPackage = Read-Package $rootPackagePath
$backendPackage = Read-Package $backendPackagePath
$frontendPackage = Read-Package $frontendPackagePath

Assert-SafeDeployScripts $rootPackagePath $rootPackage
Assert-SafeDeployScripts $backendPackagePath $backendPackage
Assert-SafeDeployScripts $frontendPackagePath $frontendPackage

$rootWrangler = Read-Text (Join-Path $root "wrangler.toml")
$backendWrangler = Read-Text (Join-Path $root "backend\wrangler.toml")
if ($rootWrangler -match '(?im)^\s*ADMIN_API_KEY\s*=|^\s*API_KEY(?:_PERMANENT)?\s*=') {
  Fail-SafetyCheck "API credentials must be configured as Cloudflare secrets, not Wrangler vars."
}
if ($backendWrangler -match '(?im)^\s*ADMIN_API_KEY\s*=|^\s*API_KEY(?:_PERMANENT)?\s*=') {
  Fail-SafetyCheck "API credentials must be configured as Cloudflare secrets, not Wrangler vars."
}

$rootD1 = Read-D1DatabaseId $rootWrangler "VIVI_D1"
$backendD1 = Read-D1DatabaseId $backendWrangler "VIVI_D1"
if ($rootD1 -ne $backendD1) {
  Fail-SafetyCheck "Root and backend VIVI_D1 database IDs differ. Deployment could point at an empty database."
}

if ($backendWrangler -notmatch '(?im)^\s*VPS_ORIGIN\s*=\s*"https://vps-api\.vivitelematics\.ca"\s*$') {
  Fail-SafetyCheck "Backend Worker must route operational storage through https://vps-api.vivitelematics.ca."
}

if ($rootWrangler -match '(?im)^\s*\[\[(?:[A-Za-z0-9_-]+\.)*kv_namespaces\]\]\s*$' -or
    $backendWrangler -match '(?im)^\s*\[\[(?:[A-Za-z0-9_-]+\.)*kv_namespaces\]\]\s*$') {
  Fail-SafetyCheck "Cloudflare KV bindings are disabled; operational Worker key-value storage must use the VPS."
}

$workspaceParent = Split-Path $root -Parent
$pagesDeployPath = Join-Path $workspaceParent "deploy-pages.ps1"
$vpsDeployPath = Join-Path $workspaceParent "deploy-vps-backend-safe.ps1"
$deployRootPath = Join-Path $workspaceParent "deploy.ps1"
$pagesDeploy = Read-Text $pagesDeployPath
$vpsDeploy = Read-Text $vpsDeployPath

if ($pagesDeploy -notmatch 'Remove-Item\s+-Recurse\s+-Force\s+\$DistDir') {
  Fail-SafetyCheck "Pages deploy must only clean the configured dist output."
}
if ($pagesDeploy -match '(?i)wrangler\s+(d1|kv|r2|pages\s+project).*delete|DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM') {
  Fail-SafetyCheck "Pages deploy contains a persistent-data operation."
}
if ($pagesDeploy -notmatch '(?i)user settings in D1/VPS SQLite are unchanged') {
  Fail-SafetyCheck "Pages deploy must declare that D1/VPS SQLite user settings are unchanged."
}

$requiredVpsSafeguards = @(
  '--exclude="\$backendName/\.env\.vps"',
  '--exclude="\$backendName/data"',
  'cp -a "\$CURRENT/data/\." "\$STAGE/data/"',
  'cp -a "\$CURRENT/\.env\.vps" "\$STAGE/"',
  'mv "\$CURRENT" "\$BACKUP"'
)
foreach ($pattern in $requiredVpsSafeguards) {
  if ($vpsDeploy -notmatch $pattern) {
    Fail-SafetyCheck "VPS deploy is missing required persistence safeguard: $pattern"
  }
}
if ($vpsDeploy -match '(?i)\brm\s+-rf\s+"?\$CURRENT/data') {
  Fail-SafetyCheck "VPS deploy must never delete CURRENT/data."
}

if (Test-Path -LiteralPath $deployRootPath) {
  $deployRoot = Read-Text $deployRootPath
  if ($deployRoot -match '(?i)wrangler\s+(d1|kv|r2|pages\s+project).*delete|DROP\s+TABLE|TRUNCATE\s+TABLE') {
    Fail-SafetyCheck "Root deploy.ps1 contains a persistent-data operation."
  }
}

Write-Host "Deployment data safety check passed."
Write-Host "Code/static assets may be updated; D1 credentials, VPS SQLite data, user settings, bindings, alerts, locations, libraries, and configuration remain preserved."
Write-Host "POLICY: Operational data uses VPS storage; deploy never seeds, purges, or overwrites user settings."
