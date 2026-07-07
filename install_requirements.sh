#!/usr/bin/env bash
set -uo pipefail

echo "========================================================"
echo " TJ NODE - Requirements Installer"
echo "========================================================"
echo

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd "$SCRIPT_DIR"
echo "[INFO] Node folder: $SCRIPT_DIR"
echo

# Python 경로 탐색: 사용자마다 ComfyUI 설치 위치/깊이가 다르므로
# 상위 폴더를 하나씩 올라가며 venv 또는 python_embeded를 직접 찾는다.
PYTHON=""
SEARCH_DIR="$SCRIPT_DIR"
while true; do
    if [ -f "$SEARCH_DIR/venv/bin/python" ]; then
        PYTHON="$SEARCH_DIR/venv/bin/python"
        break
    fi
    if [ -f "$SEARCH_DIR/python_embeded/bin/python" ]; then
        PYTHON="$SEARCH_DIR/python_embeded/bin/python"
        break
    fi
    PARENT_DIR="$(cd "$SEARCH_DIR/.." && pwd)"
    if [ "$PARENT_DIR" = "$SEARCH_DIR" ]; then
        break
    fi
    SEARCH_DIR="$PARENT_DIR"
done

if [ -z "$PYTHON" ]; then
    if command -v python3 &>/dev/null; then
        PYTHON="python3"
    elif command -v python &>/dev/null; then
        PYTHON="python"
    fi
fi

if [ -z "$PYTHON" ]; then
    echo "[ERROR] Python not found. Run this script from inside the ComfyUI Python environment."
    exit 1
else
    echo "[INFO] Python: $PYTHON"
fi
echo

if [ ! -f "requirements.txt" ]; then
    echo "[WARN] requirements.txt not found. Nothing to install."
    exit 0
fi

echo "--------------------------------------------------------"
echo "[PIP] Installing other requirements (excluding llama-cpp-python)..."
OTHER_REQ="$(mktemp)"
grep -vi '^llama-cpp-python' "requirements.txt" > "$OTHER_REQ" || true
if "$PYTHON" -m pip install -r "$OTHER_REQ" --quiet; then
    echo "[PIP] Done."
else
    echo "[WARN] Some requirements failed to install. Check manually."
fi
rm -f "$OTHER_REQ"
echo

if ! grep -qi '^llama-cpp-python' "requirements.txt"; then
    echo "========================================================"
    echo " Done! Restart ComfyUI to load the new nodes."
    echo "========================================================"
    exit 0
fi

echo "--------------------------------------------------------"
echo "[INFO] Detecting environment for llama-cpp-python..."

# llama-cpp-python은 소스 빌드 시 CMake/C++ 컴파일러가 필요하다.
# GPU(CUDA)/Apple Silicon 여부를 감지해 맞는 사전 빌드 wheel을 먼저 시도하고,
# 실패하면 CPU wheel, 그래도 실패하면 마지막으로 소스 빌드를 시도한다.
CUDA_TAG=""
OS_NAME="$(uname -s 2>/dev/null || echo unknown)"

if command -v nvidia-smi &>/dev/null; then
    # 드라이버 버전에 따라 "CUDA Version:" 또는 "CUDA UMD Version:" 표기가 다르므로 둘 다 시도한다.
    CUDA_RAW="$(nvidia-smi 2>/dev/null | sed -n -E 's/.*CUDA (UMD )?Version: ([0-9.]+).*/\2/p' | head -1)"
    if [ -n "$CUDA_RAW" ]; then
        echo "[INFO] NVIDIA GPU detected. Driver CUDA Version: $CUDA_RAW"
        CUDA_INT="$(echo "$CUDA_RAW" | tr -d '.')"
        if [ "${CUDA_INT:-0}" -ge 124 ] 2>/dev/null; then
            CUDA_TAG="cu124"
        elif [ "${CUDA_INT:-0}" -ge 123 ] 2>/dev/null; then
            CUDA_TAG="cu123"
        elif [ "${CUDA_INT:-0}" -ge 122 ] 2>/dev/null; then
            CUDA_TAG="cu122"
        elif [ "${CUDA_INT:-0}" -ge 121 ] 2>/dev/null; then
            CUDA_TAG="cu121"
        else
            echo "[INFO] CUDA version too old for prebuilt GPU wheels. Falling back to CPU."
        fi
    fi
elif [ "$OS_NAME" = "Darwin" ]; then
    echo "[INFO] macOS detected. Will try Metal-accelerated wheel."
    CUDA_TAG="metal"
else
    echo "[INFO] No NVIDIA GPU detected (or nvidia-smi unavailable). Using CPU build."
fi

INSTALLED=""

if [ -n "$CUDA_TAG" ]; then
    echo "[PIP] Installing llama-cpp-python (prebuilt wheel: $CUDA_TAG)..."
    if "$PYTHON" -m pip install llama-cpp-python --prefer-binary --extra-index-url "https://abetlen.github.io/llama-cpp-python/whl/$CUDA_TAG" --quiet; then
        INSTALLED=1
    else
        echo "[WARN] $CUDA_TAG wheel install failed. Falling back to CPU wheel..."
    fi
fi

if [ -z "$INSTALLED" ]; then
    echo "[PIP] Installing llama-cpp-python (CPU prebuilt wheel)..."
    if "$PYTHON" -m pip install llama-cpp-python --prefer-binary --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu --quiet; then
        INSTALLED=1
    fi
fi

if [ -z "$INSTALLED" ]; then
    echo "[WARN] Prebuilt wheels unavailable for this environment. Trying source build (needs CMake + C++ compiler)..."
    if "$PYTHON" -m pip install llama-cpp-python; then
        INSTALLED=1
    fi
fi

if [ -n "$INSTALLED" ]; then
    echo "[PIP] llama-cpp-python installed successfully."
else
    echo "[WARN] llama-cpp-python install failed. LLM nodes will not work."
    echo "       Install CMake + a C++ compiler, then run: $PYTHON -m pip install llama-cpp-python"
fi

echo
echo "========================================================"
echo " Done! Restart ComfyUI to load the new nodes."
echo "========================================================"
