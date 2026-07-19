@echo off
setlocal
for %%I in ("%~dp0.") do set "APP_DIR=%%~fI"
set "ELECTRON_EXE=%APP_DIR%\node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON_EXE%" (
  echo Creature Companion dependencies are not installed.
  echo Open a terminal in %APP_DIR% and run: pnpm install
  pause
  exit /b 1
)

start "Creature Companion" /D "%APP_DIR%" "%ELECTRON_EXE%" "%APP_DIR%"
