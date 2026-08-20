@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "BES_DEV_HOST=127.0.0.1"
set "BES_API_PORT=3001"
set "BES_VITE_PORT=5173"
set "API_HOST=%BES_DEV_HOST%"
set "API_PORT=%BES_API_PORT%"

echo.
echo ============================================================
echo   BENECO Enterprise System - Development Restart
echo ============================================================
echo Frontend: http://%BES_DEV_HOST%:%BES_VITE_PORT%
echo API:      http://%BES_DEV_HOST%:%BES_API_PORT%
echo.

set "BES_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  set "BES_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

if not exist "%BES_NODE%" (
  where "%BES_NODE%" >nul 2>nul
  if errorlevel 1 (
    echo ERROR: Node.js was not found in PATH or in the bundled Codex runtime.
    echo Install Node.js, then run this script again.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo ERROR: node_modules was not found.
  echo Run npm install before starting development.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo ERROR: .env.local was not found.
  echo Copy .env.example to .env.local and configure the local Oracle connection.
  pause
  exit /b 1
)

echo Stopping existing development processes...
call :stop_port %BES_API_PORT%
if errorlevel 1 exit /b 1
call :stop_port %BES_VITE_PORT%
if errorlevel 1 exit /b 1

echo.
echo Starting the BES API...
start "BES Development API" "%BES_NODE%" server\index.mjs

echo Starting the Vite development server...
start "BES Vite Frontend" "%BES_NODE%" node_modules\vite\bin\vite.js --host %BES_DEV_HOST% --port %BES_VITE_PORT%

echo.
echo BES development services are restarting.
echo Opening http://%BES_DEV_HOST%:%BES_VITE_PORT% in your default browser...
timeout /t 3 /nobreak >nul
start "" "http://%BES_DEV_HOST%:%BES_VITE_PORT%"

exit /b 0

:stop_port
set "BES_STOP_FAILED="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%~1 .*LISTENING"') do (
  echo Stopping PID %%P on port %~1...
  taskkill /PID %%P /F >nul 2>nul
  if errorlevel 1 set "BES_STOP_FAILED=1"
)
if defined BES_STOP_FAILED (
  echo.
  echo ERROR: A process on port %~1 could not be stopped.
  echo Right-click restart_dev.bat and choose "Run as administrator", then try again.
  pause
  exit /b 1
)
exit /b 0
