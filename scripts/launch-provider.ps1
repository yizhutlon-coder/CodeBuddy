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
    if ([string]::IsNullOrWhiteSpace($sessionContract)) {
      & $providerExecutable
    } else {
      & $providerExecutable $sessionContract
    }
  }
} catch {
  Write-Host ''
  Write-Host "Creature Companion could not launch $Provider." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Yellow
  Write-Host 'You can close this window and retry after fixing the provider installation.'
}
