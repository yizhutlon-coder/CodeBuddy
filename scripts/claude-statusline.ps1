$ErrorActionPreference = 'SilentlyContinue'
$inputJson = [Console]::In.ReadToEnd().Trim()

if ([string]::IsNullOrWhiteSpace($inputJson)) {
  Write-Output 'Claude Code'
  exit 0
}

$raw = $inputJson | ConvertFrom-Json
$contextPercent = $raw.context_window.used_percentage
$contextSize = $raw.context_window.context_window_size
$rateWindows = @()

if ($null -ne $raw.rate_limits.five_hour.used_percentage) {
  $rateWindows += @{
    label = '5h'
    usedPercent = [double]$raw.rate_limits.five_hour.used_percentage
    resetsAt = $raw.rate_limits.five_hour.resets_at
  }
}

if ($null -ne $raw.rate_limits.seven_day.used_percentage) {
  $rateWindows += @{
    label = '7d'
    usedPercent = [double]$raw.rate_limits.seven_day.used_percentage
    resetsAt = $raw.rate_limits.seven_day.resets_at
  }
}

try {
  $configPath = Join-Path $env:APPDATA 'creature-companion\bridge.json'
  if (Test-Path -LiteralPath $configPath) {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $payload = @{
      provider = 'claude'
      event = 'statusline'
      sessionId = [string]$raw.session_id
      title = if ($null -ne $raw.session_name) { [string]$raw.session_name } else { $null }
      cwd = [string]$raw.cwd
      telemetry = @{
        contextUsedPercent = $contextPercent
        contextWindowSize = $contextSize
        inputTokens = $raw.context_window.current_usage.input_tokens
        outputTokens = $raw.context_window.current_usage.output_tokens
        rateLimits = $rateWindows
        exact = $true
      }
      raw = $raw
    } | ConvertTo-Json -Depth 20 -Compress
    Invoke-RestMethod -Method Post -Uri $config.url -Headers @{ Authorization = "Bearer $($config.token)" } -ContentType 'application/json' -Body $payload -TimeoutSec 1 | Out-Null
  }
} catch {
  # Keep the Claude status line healthy even when the companion is closed.
}

$model = if ($null -ne $raw.model.display_name) { [string]$raw.model.display_name } else { 'Claude' }
$segments = @($model)
if ($null -ne $contextPercent) { $segments += "context $([math]::Round([double]$contextPercent))%" }
if ($rateWindows.Count -gt 0) {
  foreach ($window in $rateWindows) { $segments += "$($window.label) $([math]::Round([double]$window.usedPercent))%" }
}
Write-Output ($segments -join ' | ')
exit 0
