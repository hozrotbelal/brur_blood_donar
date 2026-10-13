$ErrorActionPreference = 'Stop'
$env:PGCLIENTENCODING = 'UTF8'
if (-not $env:DATABASE_URL) { throw 'Set $env:DATABASE_URL first (see services/backend/.env.example)' }
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) { $psql = (Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' | Sort-Object FullName -Descending | Select-Object -First 1).FullName }
if (-not $psql) { throw 'psql.exe not found' }
$dir = Join-Path $PSScriptRoot '..\services\backend\migrations'
& $psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -q -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
if ($LASTEXITCODE -ne 0) { throw 'cannot connect' }
foreach ($f in Get-ChildItem $dir -Filter *.sql | Sort-Object Name) {
  $name = $f.Name
  $done = & $psql $env:DATABASE_URL -tA -v ON_ERROR_STOP=1 -c "SELECT 1 FROM public.schema_migrations WHERE name = '$name'"
  if ($done) { Write-Host "skip  $name"; continue }
  Write-Host "apply $name"
  & $psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -q --single-transaction -f $f.FullName -c "INSERT INTO public.schema_migrations (name) VALUES ('$name')"
  if ($LASTEXITCODE -ne 0) { throw "failed: $name" }
}
Write-Host 'done'
