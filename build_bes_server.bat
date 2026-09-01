@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_EXE=python.exe"
where python.exe >nul 2>nul
if errorlevel 1 if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" set "PYTHON_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

"%PYTHON_EXE%" -m PyInstaller --version >nul 2>nul
if errorlevel 1 "%PYTHON_EXE%" -m pip install pyinstaller
if errorlevel 1 exit /b 1

for %%P in ("%PYTHON_EXE%") do set "PYTHON_ROOT=%%~dpP"

"%PYTHON_EXE%" -m PyInstaller --noconfirm --clean --onefile --windowed --name bes_server bes_server.py
if errorlevel 1 exit /b 1

copy /y "dist\bes_server.exe" "bes_server.exe" >nul
if errorlevel 1 (
    echo ERROR: Close bes_server.exe before replacing it.
    exit /b 1
)
echo Built %CD%\bes_server.exe
