@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

echo ========================================================
echo  TJ NODE - Updater
echo ========================================================
echo.

cd /d "%~dp0"
echo [INFO] Node folder: %CD%
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed.
    echo         Install it from https://git-scm.com/download/win and run this file again.
    goto :end
)

if not exist ".git" (
    echo [ERROR] This folder is not a git checkout, so it cannot be updated by this file.
    echo         It was probably installed from a ZIP. Install again with:
    echo           git clone https://github.com/designloves2/ComfyUI-TJ_NODE
    echo         inside the ComfyUI custom_nodes folder, or use ComfyUI-Manager.
    goto :end
)

for /f "delims=" %%H in ('git rev-parse --short HEAD') do set "BEFORE=%%H"
echo [INFO] Current version: %BEFORE%
echo [INFO] Checking for updates...
echo.

git pull --ff-only origin main
if errorlevel 1 (
    echo.
    echo [WARNING] The update could not be applied automatically.
    echo           This usually means files in this folder were edited locally,
    echo           or there is no internet connection.
    echo.
    echo           You can discard local edits to the node's own files and update anyway.
    echo           Your data folders ^(assetDB, promptDB, customLLM, logs^) are NOT touched.
    echo.
    set "FORCE="
    set /p "FORCE=Discard local edits and update? (Y/N, default N): "
    if /i not "!FORCE!"=="Y" (
        echo [INFO] Update cancelled.
        goto :end
    )
    git fetch origin main
    if errorlevel 1 (
        echo [ERROR] Could not reach GitHub. Check your internet connection and try again.
        goto :end
    )
    git reset --hard origin/main
    if errorlevel 1 (
        echo [ERROR] Update failed.
        goto :end
    )
)

for /f "delims=" %%H in ('git rev-parse --short HEAD') do set "AFTER=%%H"
echo.
if "%BEFORE%"=="%AFTER%" (
    echo [OK] Already up to date ^(%AFTER%^).
    goto :end
)

echo [OK] Updated: %BEFORE% -^> %AFTER%
echo.
echo Latest changes:
git log --oneline %BEFORE%..%AFTER% -n 10
echo.

if exist "install_requirements.bat" (
    set "DEPS="
    set /p "DEPS=Install new Python packages now? Recommended after an update (Y/N, default Y): "
    if /i not "!DEPS!"=="N" (
        call "install_requirements.bat"
    )
)

echo.
echo [DONE] Restart ComfyUI to use the new version.

:end
echo.
pause
endlocal
