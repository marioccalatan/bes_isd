@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies, this only happens once...
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install failed. See the errors above.
        pause
        exit /b 1
    )
)

echo.
echo Starting BENECO Enterprise System (BES)...
echo Once ready, open http://localhost:5173 in your browser.
echo Press Ctrl+C to stop the server.
echo.

call npm run dev

pause
