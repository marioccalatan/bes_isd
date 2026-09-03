@echo off
setlocal
cd /d "%~dp0"

rem Prefer npm when Node.js is installed normally. When BES is started from
rem Codex, also support the Node.js and pnpm runtime bundled with the app.
set "PACKAGE_RUNNER="
set "BES_NODE=node.exe"
set "BES_BUNDLED_RUNTIME="
where npm.cmd >nul 2>nul
if not errorlevel 1 set "PACKAGE_RUNNER=npm.cmd"

if not defined PACKAGE_RUNNER (
    if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" (
        set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\override;%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback;%PATH%"
        set "PACKAGE_RUNNER=pnpm.cmd"
        set "BES_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
        set "BES_BUNDLED_RUNTIME=1"
    )
)

if not defined PACKAGE_RUNNER (
    echo ERROR: Node.js/npm was not found.
    echo Install the current Node.js LTS release from https://nodejs.org/
    echo and then run start-bes.bat again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies, this only happens once...
    if defined BES_BUNDLED_RUNTIME set "CI=true"
    call %PACKAGE_RUNNER% install
    if errorlevel 1 (
        echo.
        echo Dependency installation failed. See the errors above.
        pause
        exit /b 1
    )
)

echo.
echo Starting BENECO Enterprise System (BES)...
echo Once ready, open http://127.0.0.1:5174 in your browser.
echo Press Ctrl+C to stop the servers.
echo.

rem Authentication and data requests require the API on port 3001. Reuse a
rem healthy existing API when Windows permissions prevent the launcher from
rem stopping it; otherwise start it in this console group with Vite.
netstat -ano | findstr /C:":3001 " | findstr /C:"LISTENING" >nul
if errorlevel 1 start "" /b "%BES_NODE%" server\index.mjs
if defined BES_BUNDLED_RUNTIME if exist "node_modules\vite\bin\vite.js" (
    call "%BES_NODE%" server\dev-gateway.mjs
) else (
    call %PACKAGE_RUNNER% run dev -- --host 127.0.0.1 --port 5174 --strictPort
)

pause
