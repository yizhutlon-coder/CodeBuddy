param(
  [ValidateSet('claude', 'codex')]
  [string]$Provider = 'claude',
  [ValidateSet('SessionStart', 'PreToolUse', 'PermissionRequest', 'Stop', 'PostToolUseFailure')]
  [string]$EventName = 'SessionStart',
  [string]$SessionId = 'demo-session'
)

$configPath = Join-Path $env:APPDATA 'creature-companion\bridge.json'
if (-not (Test-Path -LiteralPath $configPath)) {
  throw 'Start Creature Companion once before sending a demo event.'
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$payload = @{
  provider = $Provider
  event = $EventName
  sessionId = $SessionId
  title = "$Provider bridge demo"
  cwd = (Get-Location).Path
  raw = @{
    session_id = $SessionId
    hook_event_name = $EventName
    cwd = (Get-Location).Path
  }
} | ConvertTo-Json -Depth 10 -Compress

Invoke-RestMethod -Method Post -Uri $config.url -Headers @{ Authorization = "Bearer $($config.token)" } -ContentType 'application/json' -Body $payload
