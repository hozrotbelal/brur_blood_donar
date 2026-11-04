$ErrorActionPreference = 'Stop'
if (-not $env:DATABASE_URL) { throw 'Set $env:DATABASE_URL first (see services/backend/.env.example)' }
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) { $psql = (Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' | Sort-Object FullName -Descending | Select-Object -First 1).FullName }
if (-not $psql) { throw 'psql.exe not found' }
$file = Join-Path $PSScriptRoot '..\services\backend\seeds\sample-data.sql'
& $psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -q --single-transaction -f $file
if ($LASTEXITCODE -ne 0) { throw 'seed failed' }
Write-Host 'sample data loaded'
