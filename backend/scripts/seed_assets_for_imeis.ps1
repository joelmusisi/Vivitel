param(
  [Parameter(Mandatory=$true)]
  [string]$BaseUrl,

  # Admin session token from the UI: localStorage["vivi.apiKey"]
  [Parameter(Mandatory=$true)]
  [string]$ApiKey,

  # Optional tenant id header (leave empty to use the default tenant)
  [string]$TenantId = "",

  # Default configuration group id to attach assets to
  [string]$ConfigGroupId = "default",

  # If set, also sends one telemetry point per IMEI so /telemetry/lookup returns events immediately.
  [switch]$AlsoIngestTelemetry,

  # Coordinates used when AlsoIngestTelemetry is set.
  [double]$Lat = 45.4215,
  [double]$Lon = -75.6972
)

$headers = @{
  "content-type" = "application/json"
  "x-api-key"    = $ApiKey
}
if ($TenantId.Trim()) {
  $headers["x-tenant-id"] = $TenantId.Trim()
}

function Invoke-Json($Method, $Url, $BodyObj) {
  $body = $null
  if ($null -ne $BodyObj) {
    $body = ($BodyObj | ConvertTo-Json -Depth 20 -Compress)
  }
  Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -Body $body
}

$imeis = @(
  "353691840768823",
  "353691840776321",
  "353691840776495",
  "353691840781750",
  "353691840792344",
  "353691840799760"
)

# 1) Ensure the config group exists (required by POST/PUT /d1/assets).
Invoke-Json "POST" "$BaseUrl/d1/configuration-groups" @{
  id   = $ConfigGroupId
  name = "Default"
} | Out-Null

# 2) Create/update assets for each IMEI.
$results = @()
foreach ($imei in $imeis) {
  $suffix = $imei.Substring([Math]::Max(0, $imei.Length - 6))
  $assetId = "asset-$suffix"

  Invoke-Json "POST" "$BaseUrl/d1/assets" @{
    id          = $assetId
    name        = "Asset $suffix"
    imei        = $imei
    configGroup = $ConfigGroupId
  } | Out-Null

  if ($AlsoIngestTelemetry) {
    # 3) Optional: ingest one telemetry point so it appears in Live/History/lookup immediately.
    Invoke-Json "POST" "$BaseUrl/ingest/telemetry" @{
      id      = $assetId
      imei    = $imei
      lat     = $Lat
      lon     = $Lon
      speed   = 0
      source  = "seed"
    } | Out-Null
  }

  $results += [pscustomobject]@{
    IMEI    = $imei
    AssetId = $assetId
  }
}

$results | Format-Table -AutoSize
