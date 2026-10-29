@echo off
title Solo Studio - ComfyUI (:8188)
color 0D

echo =======================================================================
echo              Solo Studio - ComfyUI Engine (Port 8188)
echo =======================================================================
echo.

set "TARGET_DIR="

:: 1. Check if COMFY_DIR is set in environment
if defined COMFY_DIR if exist "%COMFY_DIR%\main.py" set "TARGET_DIR=%COMFY_DIR%"

:: 2. Check candidate standard paths
if not defined TARGET_DIR if exist "D:\ComfyUI-master\main.py" set "TARGET_DIR=D:\ComfyUI-master"
if not defined TARGET_DIR if exist "C:\ComfyUI-master\main.py" set "TARGET_DIR=C:\ComfyUI-master"
if not defined TARGET_DIR if exist "D:\ComfyUI_windows_portable\ComfyUI\main.py" set "TARGET_DIR=D:\ComfyUI_windows_portable\ComfyUI"
if not defined TARGET_DIR if exist "C:\ComfyUI_windows_portable\ComfyUI\main.py" set "TARGET_DIR=C:\ComfyUI_windows_portable\ComfyUI"
if not defined TARGET_DIR if exist "D:\ComfyUI\main.py" set "TARGET_DIR=D:\ComfyUI"
if not defined TARGET_DIR if exist "C:\ComfyUI\main.py" set "TARGET_DIR=C:\ComfyUI"
if not defined TARGET_DIR if exist "%~dp0..\ComfyUI\main.py" set "TARGET_DIR=%~dp0..\ComfyUI"
if not defined TARGET_DIR if exist "%USERPROFILE%\ComfyUI\main.py" set "TARGET_DIR=%USERPROFILE%\ComfyUI"

:: 3. Read COMFY_MODEL_ROOT from backend\.env if present
if not defined TARGET_DIR if exist "%~dp0backend\.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0backend\.env") do (
        if "%%A"=="COMFY_MODEL_ROOT" (
            if exist "%%B\main.py" set "TARGET_DIR=%%B"
        )
    )
)

if not defined TARGET_DIR (
    echo [WARNING] ComfyUI installation could not be found automatically.
    echo.
    echo Checked standard paths:
    echo   - D:\ComfyUI-master
    echo   - C:\ComfyUI-master
    echo   - D:\ComfyUI_windows_portable\ComfyUI
    echo   - C:\ComfyUI_windows_portable\ComfyUI
    echo   - COMFY_MODEL_ROOT in backend\.env
    echo.
    echo How to configure ComfyUI:
    echo   1. Set environment variable: set COMFY_DIR=C:\YourComfyUIPath
    echo   2. Or set COMFY_MODEL_ROOT in backend\.env
    echo.
    pause
    exit /b 1
)

echo Found ComfyUI at: %TARGET_DIR%
cd /d "%TARGET_DIR%"

if exist "..\python_embeded\python.exe" (
    echo [INFO] Running with embedded portable python...
    ..\python_embeded\python.exe -s main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch
) else if exist "venv\Scripts\activate.bat" (
    echo [INFO] Activating ComfyUI virtual environment...
    call venv\Scripts\activate.bat
    python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch
) else (
    echo [INFO] Running with system python...
    python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] ComfyUI exited with code %ERRORLEVEL%.
    pause
)
