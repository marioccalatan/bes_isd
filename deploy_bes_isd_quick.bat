@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "BES_HOST=192.168.62.14"
set "BES_PORT=5000"
set "API_HOST=%BES_HOST%"
set "API_PORT=%BES_PORT%"

echo.
echo ============================================================
echo   BENECO Enterprise System - Quick Restart
echo ============================================================
echo Target URL: http://%BES_HOST%:%BES_PORT%
echo NOTE: Quick Restart does not pull Git changes or rebuild the frontend.
echo       Use deploy_bes_isd.bat after every update from GitHub.
echo.

if not exist "node_modules" (
  echo ERROR: node_modules was not found.
  echo Run deploy_bes_isd.bat first to install dependencies.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo ERROR: dist\index.html was not found.
  echo Run deploy_bes_isd.bat first to build the frontend.
  pause
  exit /b 1
)

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
