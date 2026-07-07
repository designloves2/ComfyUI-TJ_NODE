@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

echo ========================================================
echo  TJ NODE - Requirements Installer
echo ========================================================
echo.

set "NODE_DIR=%~dp0."
cd /d "%NODE_DIR%"
echo [INFO] Node folder: %NODE_DIR%
echo.

rem Find Python by walking up parent folders looking for python_embeded or venv,
rem since ComfyUI install location/depth varies per user.
set "PYTHON="
set "SEARCH_DIR=%~dp0"
:find_python_loop
if exist "%SEARCH_DIR%python_embeded\python.exe" (
    set "PYTHON=%SEARCH_DIR%python_embeded\python.exe"
    goto :find_python_done
)
if exist "%SEARCH_DIR%venv\Scripts\python.exe" (
    set "PYTHON=%SEARCH_DIR%venv\Scripts\python.exe"
    goto :find_python_done
)
for %%P in ("%SEARCH_DIR%..") do set "PARENT_DIR=%%~fP\"
if /i "%PARENT_DIR%"=="%SEARCH_DIR%" goto :find_python_done
set "SEARCH_DIR=%PARENT_DIR%"
goto :find_python_loop
:find_python_done

if "%PYTHON%"=="" (
    where python >nul 2>&1 && set "PYTHON=python"
)

if "%PYTHON%"=="" (
    echo [ERROR] Python not found. Run this script from inside the ComfyUI Python environment.
    echo.
    pause
    exit /b 1
) else (
    echo [INFO] Python: %PYTHON%
)
echo.

if not exist "requirements.txt" (
    echo [WARN] requirements.txt not found. Nothing to install.
    echo.
    pause
    exit /b 0
)

echo --------------------------------------------------------
echo [PIP] Installing other requirements ^(excluding llama-cpp-python^)...
set "OTHER_REQ=%TEMP%\tj_node_other_req.txt"
findstr /v /i "^llama-cpp-python" "requirements.txt" > "%OTHER_REQ%"
"%PYTHON%" -m pip install -r "%OTHER_REQ%" --quiet
if errorlevel 1 (
    echo [WARN] Some requirements failed to install. Check manually.
) else (
    echo [PIP] Done.
)
del "%OTHER_REQ%" >nul 2>&1
echo.

findstr /i "^llama-cpp-python" "requirements.txt" >nul
if errorlevel 1 goto :done

echo --------------------------------------------------------
echo [INFO] Detecting environment for llama-cpp-python...

rem llama-cpp-python requires CMake/a C++ compiler to build from source.
rem Detect GPU (CUDA) and try the matching prebuilt wheel first, then fall
rem back to the CPU wheel, and only build from source as a last resort.
set "CUDA_RAW="
set "CUDALINE="
where nvidia-smi >nul 2>&1
if not errorlevel 1 (
    rem Different driver versions print "CUDA Version:" or "CUDA UMD Version:", so try both.
    for /f "tokens=* delims=" %%A in ('nvidia-smi 2^>nul ^| findstr /R /C:"CUDA.*Version:"') do set "CUDALINE=%%A"
    if defined CUDALINE (
        set "AFTER=!CUDALINE:*CUDA UMD Version: =!"
        if "!AFTER!"=="!CUDALINE!" set "AFTER=!CUDALINE:*CUDA Version: =!"
        if not "!AFTER!"=="!CUDALINE!" (
            for /f "tokens=1" %%B in ("!AFTER!") do set "CUDA_RAW=%%B"
        )
    )
)

set "CUDA_TAG="
if defined CUDA_RAW (
    echo [INFO] NVIDIA GPU detected. Driver CUDA Version: !CUDA_RAW!
    set "CUDA_NODOT=!CUDA_RAW:.=!"
    set /a CUDA_INT=!CUDA_NODOT! 2>nul
    if defined CUDA_INT (
        if !CUDA_INT! GEQ 124 (
            set "CUDA_TAG=cu124"
        ) else if !CUDA_INT! GEQ 123 (
            set "CUDA_TAG=cu123"
        ) else if !CUDA_INT! GEQ 122 (
            set "CUDA_TAG=cu122"
        ) else if !CUDA_INT! GEQ 121 (
            set "CUDA_TAG=cu121"
        )
    )
    if not defined CUDA_TAG echo [INFO] CUDA version too old for prebuilt GPU wheels. Falling back to CPU.
) else (
    echo [INFO] No NVIDIA GPU detected ^(or nvidia-smi unavailable^). Using CPU build.
)

set "INSTALLED="

if defined CUDA_TAG (
    echo [PIP] Installing llama-cpp-python ^(GPU prebuilt wheel: !CUDA_TAG!^)...
    "%PYTHON%" -m pip install llama-cpp-python --prefer-binary --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/!CUDA_TAG! --quiet
    if not errorlevel 1 set "INSTALLED=1"
    if not defined INSTALLED echo [WARN] GPU wheel install failed. Falling back to CPU wheel...
)

if not defined INSTALLED (
    echo [PIP] Installing llama-cpp-python ^(CPU prebuilt wheel^)...
    "%PYTHON%" -m pip install llama-cpp-python --prefer-binary --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu --quiet
    if not errorlevel 1 set "INSTALLED=1"
)

if not defined INSTALLED (
    echo [WARN] Prebuilt wheels unavailable for this environment. Trying source build ^(needs CMake + C++ compiler^)...
    "%PYTHON%" -m pip install llama-cpp-python
    if not errorlevel 1 set "INSTALLED=1"
)

if defined INSTALLED (
    echo [PIP] llama-cpp-python installed successfully.
) else (
    echo [WARN] llama-cpp-python install failed. LLM nodes will not work.
    echo        Install CMake + Visual Studio Build Tools ^(Desktop C++^), then run:
    echo         "%PYTHON%" -m pip install llama-cpp-python
)

:done
echo.
echo ========================================================
echo  Done! Restart ComfyUI to load the new nodes.
echo ========================================================
pause
