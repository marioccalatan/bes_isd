@echo off
setlocal EnableExtensions

cd /d "%~dp0"

rem Listen on every IPv4 interface so BES is reachable through both
rem of this server's assigned network addresses.
set "BES_BIND_HOST=0.0.0.0"
set "BES_HOST_PRIMARY=192.168.62.14"
set "BES_HOST_SECONDARY=192.168.10.14"
set "BES_PORT=5000"
set "API_HOST=%BES_BIND_HOST%"
set "API_PORT=%BES_PORT%"
set "BES_BRANCH=main"

echo.
echo ============================================================
echo   BENECO Enterprise System - Full Deploy
echo ============================================================
echo Target URLs:
echo   http://%BES_HOST_PRIMARY%:%BES_PORT%
echo   http://%BES_HOST_SECONDARY%:%BES_PORT%
echo Deployment folder: %CD%
echo.

set "BES_GIT="
for /f "delims=" %%G in ('where git.exe 2^>nul') do if not defined BES_GIT set "BES_GIT=%%G"
if not defined BES_GIT if exist "%ProgramFiles%\Git\cmd\git.exe" set "BES_GIT=%ProgramFiles%\Git\cmd\git.exe"
if not defined BES_GIT if exist "%ProgramFiles(x86)%\Git\cmd\git.exe" set "BES_GIT=%ProgramFiles(x86)%\Git\cmd\git.exe"
if not defined BES_GIT (
  for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do if exist "%%D\resources\app\git\cmd\git.exe" set "BES_GIT=%%D\resources\app\git\cmd\git.exe"
)

if not defined BES_GIT (
  echo ERROR: Git was not found in PATH, Program Files, or GitHub Desktop.
  echo Open GitHub Desktop once under this Windows account, or install Git for Windows.
  pause
  exit /b 1
)

echo Git executable: %BES_GIT%

if not exist ".git" (
  echo ERROR: %CD% is not a Git working copy.
  echo Clone https://github.com/marioccalatan/bes_isd.git into this folder first.
  pause
  exit /b 1
)

echo Updating source code from origin/%BES_BRANCH%...
"%BES_GIT%" fetch origin %BES_BRANCH%
if errorlevel 1 (
  echo.
  echo ERROR: git fetch failed. Check the server's network and GitHub access.
  pause
  exit /b 1
)

"%BES_GIT%" pull --ff-only origin %BES_BRANCH%
if errorlevel 1 (
  echo.
  echo ERROR: git pull failed. Resolve local changes or branch divergence, then retry.
  echo No files were reset or discarded.
  pause
  exit /b 1
)

for /f %%C in ('call "%BES_GIT%" rev-parse --short HEAD') do set "BES_COMMIT=%%C"
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

echo.
echo Stopping the existing BES process before updating dependencies...
call :stop_port %BES_PORT%
if errorlevel 1 (
  echo.
  echo ERROR: The existing BES process could not be stopped.
  echo Run this deployment script as Administrator and try again.
  pause
  exit /b 1
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
echo Starting BES on all IPv4 network interfaces ^(%BES_BIND_HOST%:%BES_PORT%^)
echo Available URLs:
echo   http://%BES_HOST_PRIMARY%:%BES_PORT%
echo   http://%BES_HOST_SECONDARY%:%BES_PORT%
echo Deployed commit: %BES_COMMIT%
echo Press Ctrl+C in this window to stop the server.
echo.
call npm run start

pause
exit /b 0

:stop_port
set "BES_STOP_FAILED="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:":%~1" ^| findstr /C:"LISTENING"') do (
  echo Stopping PID %%P on port %~1...
  taskkill /PID %%P /F >nul 2>nul
  if errorlevel 1 set "BES_STOP_FAILED=1"
)
if defined BES_STOP_FAILED exit /b 1

rem Give Windows time to release loaded Node.js/native-module file handles.
timeout /t 2 /nobreak >nul

netstat -ano | findstr /C:":%~1" | findstr /C:"LISTENING" >nul
if not errorlevel 1 exit /b 1
exit /b 0
