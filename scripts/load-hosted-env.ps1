# Loads .env.hosted.local into the CURRENT PowerShell session.
#
# Dot-source it so the variables persist in your shell:
#   . .\scripts\load-hosted-env.ps1
#
# Values are never printed — only the key names that were loaded. Use this so
# hosted credentials stay out of command lines, shell history, and logs.
#
# Clear them again with:
#   . .\scripts\load-hosted-env.ps1 -Clear

param([switch]$Clear)

$ErrorActionPreference = 'Stop'

$keys = @(
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_DB_URL'
)

if ($Clear) {
    foreach ($key in $keys) {
        if (Test-Path "Env:\$key") { Remove-Item "Env:\$key" }
    }
    Write-Host "Cleared hosted credentials from this session: $($keys -join ', ')"
    return
}

$path = Join-Path (Split-Path -Parent $PSScriptRoot) '.env.hosted.local'

if (-not (Test-Path $path)) {
    Write-Host "Not found: $path" -ForegroundColor Yellow
    Write-Host "Copy .env.hosted.example to .env.hosted.local and fill it in."
    return
}

$loaded = @()
$blank = @()

foreach ($line in Get-Content $path) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }

    $split = $trimmed.IndexOf('=')
    if ($split -lt 1) { continue }

    $name = $trimmed.Substring(0, $split).Trim()
    $value = $trimmed.Substring($split + 1).Trim()

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    if ($value -eq '') { $blank += $name; continue }

    Set-Item -Path "Env:\$name" -Value $value
    $loaded += $name
}

if ($loaded.Count -gt 0) {
    Write-Host "Loaded into this session (values not shown): $($loaded -join ', ')" -ForegroundColor Green
}
if ($blank.Count -gt 0) {
    Write-Host "Present but EMPTY, still needs filling: $($blank -join ', ')" -ForegroundColor Yellow
}

# Guard: a service-role key must never leak into the app's build-time config.
foreach ($name in $loaded) {
    if ($name -like 'EXPO_PUBLIC_*') {
        Write-Host "REFUSING TO CONTINUE: $name is EXPO_PUBLIC_ and would be embedded in the APK." -ForegroundColor Red
        Remove-Item "Env:\$name"
    }
}
