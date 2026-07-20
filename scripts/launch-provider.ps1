param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('claude', 'codex')]
  [string]$Provider
)

$ErrorActionPreference = 'Stop'
$providerExecutable = $env:CREATURE_COMPANION_PROVIDER_EXE
$sessionTitle = $env:CREATURE_COMPANION_SESSION_TITLE
$sessionContract = $env:CREATURE_COMPANION_SESSION_CONTRACT

try {
  if ([string]::IsNullOrWhiteSpace($providerExecutable)) {
    throw 'The provider executable was not supplied by Creature Companion.'
  }

  $host.UI.RawUI.WindowTitle = "Creature Companion - $sessionTitle"
  if ($Provider -eq 'claude') {
    $arguments = @('--name', $sessionTitle)
    if (-not [string]::IsNullOrWhiteSpace($sessionContract)) {
      $arguments += @('--append-system-prompt', $sessionContract)
    }
    & $providerExecutable @arguments
  } else {
    if ([string]::IsNullOrWhiteSpace($env:CODEX_HOME)) {
      throw 'The Codex configuration directory was not supplied by Creature Companion.'
    }
    Write-Host 'Starting Codex with configuration from ' -NoNewline
    Write-Host $env:CODEX_HOME -ForegroundColor Cyan
    if ([string]::IsNullOrWhiteSpace($sessionContract)) {
      & $providerExecutable
    } else {
      & $providerExecutable $sessionContract
    }
  }
  if ($LASTEXITCODE -ne 0) {
    throw "$Provider exited during startup with code $LASTEXITCODE."
  }
  Write-Host ''
  Write-Host "$Provider session ended. You can close this window." -ForegroundColor Cyan
} catch {
  Write-Host ''
  Write-Host "Creature Companion could not launch $Provider." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Yellow
  Write-Host 'You can close this window and retry after fixing the provider installation.'
}
