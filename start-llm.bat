@echo off
title Solo Studio - Local LLM (:8085)
color 0B

echo =======================================================================
echo              Solo Studio - Local LLM Engine (Port 8085)
echo =======================================================================
echo.

set "LLAMA_DIR=%USERPROFILE%\.cache\solotensor\llama"
set "LLAMA_EXE=%LLAMA_DIR%\llama-server.exe"
set "LLM_DIR=%USERPROFILE%\.cache\solotensor\llm"
set "MODEL_FILE=%LLM_DIR%\qwen2.5-coder-3b-instruct-q4_k_m.gguf"
set "PORT=8085"

if not exist "%LLAMA_EXE%" (
    echo [ERROR] llama-server executable not found at:
    echo   %LLAMA_EXE%
    echo.
    echo Please make sure llama.cpp is installed in:
    echo   %LLAMA_DIR%
    echo.
    pause
    exit /b 1
)

if not exist "%MODEL_FILE%" (
    echo [ERROR] GGUF model file not found at:
    echo   %MODEL_FILE%
    echo.
    echo Please place qwen2.5-coder-3b-instruct-q4_k_m.gguf inside:
    echo   %LLM_DIR%
    echo.
    pause
    exit /b 1
)

echo Starting llama-server on http://127.0.0.1:%PORT%...
echo Model:   qwen2.5-coder-3b-instruct-q4_k_m.gguf
echo Context: 8192 tokens
echo API:     http://127.0.0.1:%PORT%/v1/chat/completions
echo.

"%LLAMA_EXE%" -m "%MODEL_FILE%" --host 127.0.0.1 --port %PORT% -c 8192

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] llama-server exited with code %ERRORLEVEL%.
    pause
)
