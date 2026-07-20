$ErrorActionPreference = 'Stop'
$codexExecutable = $env:CREATURE_COMPANION_CODEX_EXE

try {
  $host.UI.RawUI.WindowTitle = 'Creature Companion - Review Codex hooks'
  if ([string]::IsNullOrWhiteSpace($codexExecutable)) {
    throw 'Creature Companion could not locate the standalone Codex CLI.'
  }
  Write-Host 'Creature Companion: final Codex connection step' -ForegroundColor Cyan
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
