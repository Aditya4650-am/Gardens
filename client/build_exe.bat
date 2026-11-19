@echo off
REM Build the Gardenscapes Windows client as ONE single .exe (onefile).
REM Usage: double-click build_exe.bat   (or run it from a terminal in client/)
setlocal
cd /d "%~dp0"

echo [1/3] Installing build tools (pyinstaller, pywebview)...
python -m pip install --quiet --disable-pip-version-check pyinstaller pywebview
if errorlevel 1 (
  echo Failed to install build tools. Make sure Python 3.9+ is installed and on PATH.
  pause
  exit /b 1
)

echo [2/3] Building the single EXE...
python -m PyInstaller --clean --noconfirm igg_client.spec
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

if not exist "dist\IGG VIP TOOL.exe" (
  echo Build failed: dist\IGG VIP TOOL.exe was not produced.
  pause
  exit /b 1
)

echo [3/3] Hashing the EXE...
powershell -NoProfile -Command "$h=(Get-FileHash 'dist\IGG VIP TOOL.exe' -Algorithm SHA256).Hash.ToLower(); Write-Host ('  SHA-256: ' + $h); $h | Out-File -FilePath 'dist\IGG VIP TOOL.exe.sha256' -Encoding ascii -NoNewline"
if errorlevel 1 (
  echo Hashing failed.
  pause
  exit /b 1
)

echo.
echo Done.
echo   Single EXE:  dist\IGG VIP TOOL.exe   (no zip, no folder - just run it)
echo   Hash file:   dist\IGG VIP TOOL.exe.sha256
echo.
echo   Auto-update: paste the SHA-256 into CLIENT_UPDATE_SHA256 and the
echo   download URL of this exe into CLIENT_UPDATE_URL.
echo.
pause
