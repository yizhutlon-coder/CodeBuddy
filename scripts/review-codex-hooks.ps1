$ErrorActionPreference = 'Stop'
$codexExecutable = $env:CREATURE_COMPANION_CODEX_EXE

try {
  $host.UI.RawUI.WindowTitle = 'Creature Companion - Review Codex hooks'
  if ([string]::IsNullOrWhiteSpace($codexExecutable)) {
    throw 'Creature Companion could not locate the standalone Codex CLI.'
  }
  if ([string]::IsNullOrWhiteSpace($env:CODEX_HOME)) {
    throw 'Creature Companion could not determine the Codex configuration directory.'
  }
  $hooksPath = Join-Path $env:CODEX_HOME 'hooks.json'
  if (-not (Test-Path -LiteralPath $hooksPath -PathType Leaf)) {
    throw "Creature Companion's Codex hook file was not found at $hooksPath"
  }
  Write-Host 'Creature Companion: final Codex connection step' -ForegroundColor Cyan
  Write-Host ''
  Write-Host 'Hook file: ' -NoNewline
  Write-Host $hooksPath -ForegroundColor Green
  Write-Host 'Codex is being opened with this exact configuration directory.'
  Write-Host ''
  Write-Host 'When Codex opens, type ' -NoNewline
  Write-Host '/hooks' -ForegroundColor Yellow
  Write-Host 'Then review and trust the Creature Companion commands.'
  Write-Host 'After approval, start or interact with a task. The control panel will verify the first event automatically.'
  Write-Host ''
  & $codexExecutable
} catch {
  Write-Host ''
  Write-Host 'Codex could not be opened for hook review.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Yellow
}
