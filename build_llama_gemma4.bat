@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

echo ========================================================
echo  llama-cpp-python Gemma4 source build installer
echo  ComfyUI Embedded Python
echo ========================================================
echo.

set "PYTHON=C:\AI\ComfyUI-Easy-Install\python_embeded\python.exe"
set "BUILD_DIR=%TEMP%\llama_cpp_build"

:: Check Python
if not exist "%PYTHON%" (
    echo [ERROR] Python not found: %PYTHON%
    pause & exit /b 1
)
echo [OK] Python: %PYTHON%

:: Check Git
where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git not found. Install from https://git-scm.com/download/win
    pause & exit /b 1
)
echo [OK] Git found

:: Find vcvars64.bat via vswhere
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
    echo [ERROR] vcvars64.bat not found. Install Visual Studio 2022 Build Tools with C++ workload.
    pause & exit /b 1
)
echo [OK] vcvars64: %VCVARS%

:: Detect CUDA
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
    echo [WARN] CUDA not found - building CPU only
)

:: Prepare build directory
if exist "%BUILD_DIR%" rd /s /q "%BUILD_DIR%"
mkdir "%BUILD_DIR%"
echo [OK] Build dir: %BUILD_DIR%

:: Clone
echo.
echo [GIT] Cloning llama-cpp-python...
cd /d "%BUILD_DIR%"
git clone https://github.com/abetlen/llama-cpp-python.git
if errorlevel 1 ( echo [ERROR] Clone failed & pause & exit /b 1 )

:: Update llama.cpp submodule to latest
echo.
echo [GIT] Updating llama.cpp submodule to latest...
cd /d "%BUILD_DIR%\llama-cpp-python"
git submodule update --init
cd /d "%BUILD_DIR%\llama-cpp-python\vendor\llama.cpp"
git pull origin master
if errorlevel 1 ( echo [ERROR] Submodule update failed & pause & exit /b 1 )
cd /d "%BUILD_DIR%\llama-cpp-python"

:: Build (call vcvars first so compiler is in PATH for the same cmd session)
echo.
echo [BUILD] Setting up C++ environment and building (10-20 min)...
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
"%PYTHON%" -m pip install -e . --force-reinstall --no-build-isolation
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed.
    pause & exit /b 1
)

echo.
echo ========================================================
echo  Done! Restart ComfyUI.
echo ========================================================
pause
