$ErrorActionPreference = 'Stop'
$installerUrl = 'https://chatgpt.com/codex/install.ps1'

try {
  $host.UI.RawUI.WindowTitle = 'Creature Companion - Install Codex CLI'
  Write-Host 'Creature Companion: Codex CLI setup' -ForegroundColor Cyan
  Write-Host 'Downloading the official OpenAI installer from:'
  Write-Host $installerUrl -ForegroundColor Yellow
  Write-Host ''
  $installerSource = Invoke-RestMethod -Uri $installerUrl
  & ([scriptblock]::Create([string]$installerSource))
  Write-Host ''
  Write-Host 'Installation finished. Return to Creature Companion and click Check again.' -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host 'The Codex CLI installer did not finish.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Yellow
  Write-Host 'This window will remain open so you can review the error.'
}
