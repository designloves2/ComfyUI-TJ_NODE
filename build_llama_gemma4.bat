@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

echo ========================================================
echo  llama-cpp-python GPU/latest source build installer
echo  (CUDA + newest llama.cpp: Gemma4 / Qwen3-VL support)
echo  ComfyUI Embedded Python
echo ========================================================
echo.

:: ── Locate embedded Python (auto-detect relative to this script) ──
:: This .bat lives in  <install>\ComfyUI\custom_nodes\ComfyUI-TJ_NODE\
:: Embedded Python is at <install>\python_embeded\python.exe
set "PYTHON=%~dp0..\..\..\python_embeded\python.exe"
if not exist "%PYTHON%" (
    :: Fallback: common ComfyUI-Easy-Install path
    set "PYTHON=C:\AI\ComfyUI-Easy-Install\python_embeded\python.exe"
)
if not exist "%PYTHON%" (
    echo [ERROR] Embedded Python not found next to this script.
    echo         Expected: %~dp0..\..\..\python_embeded\python.exe
    echo         Edit the PYTHON= line in this file if your layout differs.
    pause & exit /b 1
)
echo [OK] Python: %PYTHON%

set "BUILD_DIR=%TEMP%\llama_cpp_build"
set "WHEEL_OUT=%~dp0wheels"

:: ── Check Git ──
where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git not found. Install from https://git-scm.com/download/win
    pause & exit /b 1
)
echo [OK] Git found

:: ── Find vcvars64.bat via vswhere ──
set "VCVARS="
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "%VSWHERE%" (
    for /f "usebackq delims=" %%P in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
        if exist "%%P\VC\Auxiliary\Build\vcvars64.bat" (
            set "VCVARS=%%P\VC\Auxiliary\Build\vcvars64.bat"
        )
    )
)
if not defined VCVARS (
    if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
        set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
    )
)
if not defined VCVARS (
    if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" (
        set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
    )
)
if not defined VCVARS (
    echo [ERROR] vcvars64.bat not found. Install Visual Studio 2022 Build Tools with the
    echo         "Desktop development with C++" workload.
    pause & exit /b 1
)
echo [OK] vcvars64: %VCVARS%

:: ── Detect CUDA ──
set "CUDA_ARGS="
if defined CUDA_PATH (
    if exist "%CUDA_PATH%\bin\nvcc.exe" (
        echo [OK] CUDA: %CUDA_PATH%
        set "CUDA_ARGS=-DGGML_CUDA=on"
    )
)
if not defined CUDA_ARGS (
    for /d %%D in ("C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v*") do (
        set "CUDA_ARGS=-DGGML_CUDA=on"
        echo [OK] CUDA found: %%D
    )
)
if not defined CUDA_ARGS (
    echo [WARN] CUDA not found - building CPU only. GPU acceleration will be unavailable.
)

:: ── Prepare build directory ──
if exist "%BUILD_DIR%" rd /s /q "%BUILD_DIR%"
mkdir "%BUILD_DIR%"
echo [OK] Build dir: %BUILD_DIR%

:: ── Clone ──
echo.
echo [GIT] Cloning llama-cpp-python...
cd /d "%BUILD_DIR%"
git clone https://github.com/abetlen/llama-cpp-python.git
if errorlevel 1 ( echo [ERROR] Clone failed & pause & exit /b 1 )

:: ── Update llama.cpp submodule to latest (this is what adds newest model support) ──
echo.
echo [GIT] Updating llama.cpp submodule to latest master...
cd /d "%BUILD_DIR%\llama-cpp-python"
git submodule update --init
cd /d "%BUILD_DIR%\llama-cpp-python\vendor\llama.cpp"
git pull origin master
if errorlevel 1 ( echo [ERROR] Submodule update failed & pause & exit /b 1 )
cd /d "%BUILD_DIR%\llama-cpp-python"

:: ── Build a WHEEL (not editable!) ──
:: IMPORTANT: we build a real .whl and install that, instead of `pip install -e .`.
:: An editable install keeps the Python sources in %TEMP%; when Windows cleans TEMP
:: the package breaks with "llama.dll / __init__.py not found". A wheel is self-contained.
echo.
echo [BUILD] Setting up C++ environment and building wheel (10-20 min)...
echo.
call "%VCVARS%"
set "CMAKE_GENERATOR=Ninja"
set "CC=cl.exe"
set "CXX=cl.exe"
if defined CUDA_ARGS (
    set "CMAKE_ARGS=%CUDA_ARGS% -DCMAKE_C_COMPILER=cl.exe -DCMAKE_CXX_COMPILER=cl.exe"
) else (
    set "CMAKE_ARGS=-DCMAKE_C_COMPILER=cl.exe -DCMAKE_CXX_COMPILER=cl.exe"
)

if not exist "%WHEEL_OUT%" mkdir "%WHEEL_OUT%"
"%PYTHON%" -m pip wheel . --no-deps --no-build-isolation -w "%WHEEL_OUT%"
if errorlevel 1 (
    echo.
    echo [ERROR] Wheel build failed.
    pause & exit /b 1
)

:: ── Install the freshly built wheel ──
:: --no-deps keeps your existing numpy/torch etc. intact (avoids dependency conflicts).
echo.
echo [INSTALL] Installing built wheel...
set "BUILT_WHL="
for /f "delims=" %%W in ('dir /b /o-d "%WHEEL_OUT%\llama_cpp_python-*.whl" 2^>nul') do (
    if not defined BUILT_WHL set "BUILT_WHL=%WHEEL_OUT%\%%W"
)
if not defined BUILT_WHL ( echo [ERROR] No wheel produced. & pause & exit /b 1 )
echo [OK] Wheel: %BUILT_WHL%
"%PYTHON%" -m pip install --force-reinstall --no-deps "%BUILT_WHL%"
if errorlevel 1 ( echo [ERROR] Install failed. & pause & exit /b 1 )

:: Ensure pure-python runtime deps exist (won't touch numpy/torch versions)
"%PYTHON%" -m pip install diskcache jinja2 typing-extensions >nul 2>&1

echo.
echo ========================================================
echo  Done! A reusable wheel was saved to:
echo    %WHEEL_OUT%
echo  Keep it as a backup - reinstall later without rebuilding:
echo    "%PYTHON%" -m pip install --force-reinstall --no-deps "the .whl"
echo.
echo  Now RESTART ComfyUI.
echo ========================================================
pause
