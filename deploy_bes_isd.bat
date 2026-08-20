@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "BES_HOST=192.168.62.14"
set "BES_PORT=5000"
set "API_HOST=%BES_HOST%"
set "API_PORT=%BES_PORT%"
set "BES_BRANCH=main"

echo.
echo ============================================================
echo   BENECO Enterprise System - Full Deploy
echo ============================================================
echo Target URL: http://%BES_HOST%:%BES_PORT%
echo Deployment folder: %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git was not found in PATH.
  echo Install Git or open this from Git Bash / GitHub Desktop's repository shell.
  pause
  exit /b 1
)

if not exist ".git" (
  echo ERROR: %CD% is not a Git working copy.
  echo Clone https://github.com/marioccalatan/bes_isd.git into this folder first.
  pause
  exit /b 1
)

echo Updating source code from origin/%BES_BRANCH%...
git fetch origin %BES_BRANCH%
if errorlevel 1 (
  echo.
  echo ERROR: git fetch failed. Check the server's network and GitHub access.
  pause
  exit /b 1
)

git pull --ff-only origin %BES_BRANCH%
if errorlevel 1 (
  echo.
  echo ERROR: git pull failed. Resolve local changes or branch divergence, then retry.
  echo No files were reset or discarded.
  pause
  exit /b 1
)

for /f %%C in ('git rev-parse --short HEAD') do set "BES_COMMIT=%%C"
echo Deploying commit: %BES_COMMIT%
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
echo Deployed commit: %BES_COMMIT%
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
