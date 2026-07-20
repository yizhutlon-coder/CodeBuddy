$ErrorActionPreference = 'Stop'
$installerUrl = 'https://chatgpt.com/codex/install.ps1'
$installerPath = Join-Path ([System.IO.Path]::GetTempPath()) "openai-codex-installer-$([guid]::NewGuid().ToString('N')).ps1"

try {
  $host.UI.RawUI.WindowTitle = 'Creature Companion - Install Codex CLI'
  Write-Host 'Creature Companion: Codex CLI setup' -ForegroundColor Cyan
  Write-Host 'Downloading the official OpenAI installer from:'
  Write-Host $installerUrl -ForegroundColor Yellow
  Write-Host ''
  Invoke-WebRequest -UseBasicParsing -Uri $installerUrl -OutFile $installerPath
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installerPath
  if ($LASTEXITCODE -ne 0) {
    throw "The official installer exited with code $LASTEXITCODE."
  }
  Write-Host ''
  Write-Host 'Installation finished. Return to Creature Companion and click Check again.' -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host 'The Codex CLI installer did not finish.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Yellow
  Write-Host 'This window will remain open so you can review the error.'
} finally {
  if (Test-Path -LiteralPath $installerPath) {
    Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
  }
}
