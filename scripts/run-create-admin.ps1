param(
  [Parameter(Mandatory = $false)]
  [string]$Email = 'admin.user@gmail.com'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Load env vars from .env.local
$envFile = Join-Path (Get-Location) '.env.local'
if (-not (Test-Path $envFile)) {
  throw "Missing $envFile. Create it with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line.Length -eq 0) { return }
  if ($line.StartsWith('#')) { return }
  $parts = $line.Split('=', 2)
  if ($parts.Count -ne 2) { return }
  $name = $parts[0].Trim()
  $value = $parts[1].Trim()
  if ($name.Length -eq 0) { return }
  [System.Environment]::SetEnvironmentVariable($name, $value)
}

if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
  throw 'Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY after loading .env.local'
}

node .\scripts\create-admin-user.mjs --email $Email --password "admin123" --store-first
