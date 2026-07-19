param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('claude', 'codex')]
  [string]$Provider,

  [string]$EventName = ''
)

$ErrorActionPreference = 'Stop'

try {
  $inputJson = [Console]::In.ReadToEnd().Trim()
  if ([string]::IsNullOrWhiteSpace($inputJson)) {
    exit 0
  }

  $raw = $inputJson | ConvertFrom-Json
  $configPath = Join-Path $env:APPDATA 'creature-companion\bridge.json'
  if (-not (Test-Path -LiteralPath $configPath)) {
    exit 0
  }

  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $resolvedEvent = if (-not [string]::IsNullOrWhiteSpace($EventName)) {
    $EventName
  } elseif ($null -ne $raw.hook_event_name) {
    [string]$raw.hook_event_name
  } elseif ($null -ne $raw.type) {
    [string]$raw.type
  } else {
    'event'
  }

  $sessionId = if ($null -ne $raw.session_id) {
    [string]$raw.session_id
  } elseif ($null -ne $raw.thread_id) {
    [string]$raw.thread_id
  } else {
    $null
  }

  $payload = @{
    provider = $Provider
    event = $resolvedEvent
    sessionId = $sessionId
    title = if ($null -ne $raw.session_title) { [string]$raw.session_title } else { $null }
    cwd = if ($null -ne $raw.cwd) { [string]$raw.cwd } else { $null }
    raw = $raw
  } | ConvertTo-Json -Depth 20 -Compress

  Invoke-RestMethod -Method Post -Uri $config.url -Headers @{ Authorization = "Bearer $($config.token)" } -ContentType 'application/json' -Body $payload -TimeoutSec 2 | Out-Null
} catch {
  # Companion delivery must never block or alter the provider's own hook flow.
}

exit 0
