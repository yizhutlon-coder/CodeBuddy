@echo off
setlocal
set "APP_DIR=%~dp0"
set "ELECTRON_EXE=%APP_DIR%node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON_EXE%" (
  echo Creature Companion dependencies are not installed.
  echo Open a terminal in %APP_DIR% and run: pnpm install
  pause
  exit /b 1
)

start "Creature Companion" "%ELECTRON_EXE%" "%APP_DIR%"
