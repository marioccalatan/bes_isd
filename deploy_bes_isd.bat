@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "BES_HOST=192.168.62.14"
set "BES_PORT=5000"
set "API_HOST=%BES_HOST%"
set "API_PORT=%BES_PORT%"

echo.
echo ============================================================
echo   BENECO Enterprise System - Full Deploy
echo ============================================================
echo Target URL: http://%BES_HOST%:%BES_PORT%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  echo Install Node.js or open this from a shell where node is available.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found in PATH.
  echo Install Node.js/npm or open this from a shell where npm is available.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo WARNING: .env.local was not found.
  echo Create .env.local from .env.example and set ORACLE_PASSWORD before production use.
  echo.
)

echo Installing/checking npm dependencies...
call npm install
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

echo.
echo Building frontend and TypeScript...
call npm run build
if errorlevel 1 (
  echo.
  echo ERROR: npm run build failed.
  pause
  exit /b 1
)

echo.
echo Restarting any process already listening on port %BES_PORT%...
call :stop_port %BES_PORT%

echo.
echo Starting BES on http://%BES_HOST%:%BES_PORT%
echo Press Ctrl+C in this window to stop the server.
echo.
call npm run start

pause
exit /b 0

:stop_port
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:":%~1" ^| findstr /C:"LISTENING"') do (
  echo Stopping PID %%P on port %~1...
  taskkill /PID %%P /F >nul 2>nul
)
exit /b 0
