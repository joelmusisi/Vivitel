param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$SqlFile = "./scripts/postgresql_partial_indexes.sql"
)

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Write-Error "DATABASE_URL is not set. Pass -DatabaseUrl or set env:DATABASE_URL."
  exit 1
}

if (-not (Test-Path $SqlFile)) {
  Write-Error "SQL file not found: $SqlFile"
  exit 1
}

psql "$DatabaseUrl" -f "$SqlFile"
exit $LASTEXITCODE
