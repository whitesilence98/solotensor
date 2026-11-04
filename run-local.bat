@echo off
setlocal
title SoloTensor - Local Dev

rem SoloTensor local dev launcher.
rem Starts the two required services (backend :8000, frontend :3000) in
rem separate windows. ComfyUI (:8188) and the local LLM (:8085) are optional
rem and run from their own install directories, so they are not started here.

cd /d "%~dp0"

echo =======================================================================
echo   SoloTensor - starting local dev stack
echo =======================================================================
echo.

if not exist "backend\app\main.py" (
    echo [ERROR] backend\app\main.py not found.
    echo         Run this script from the repository root.
    echo.
    pause
    exit /b 1
)

if not exist "frontend\package.json" (
    echo [ERROR] frontend\package.json not found.
    echo.
    pause
    exit /b 1
)

rem Pick the project virtualenv, falling back to python on PATH.
set "PY=%~dp0backend\.venv\Scripts\python.exe"
if not exist "%PY%" (
    echo [WARN] backend\.venv not found - falling back to python on PATH.
    echo.
    set "PY=python"
)

rem start inherits this environment, so the child process sees PYTHONPATH.
set "PYTHONPATH=%~dp0backend"

rem Install frontend deps once, before spawning the window.
if not exist "frontend\node_modules" (
    echo [INFO] frontend\node_modules missing - installing dependencies...
    pushd "%~dp0frontend"
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        popd
        pause
        exit /b 1
    )
    popd
    echo.
)

echo [1/2] Backend API  -^> http://127.0.0.1:8000
start "SoloTensor - Backend (:8000)" /d "%~dp0backend" cmd /k ""%PY%" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak >nul

echo [2/2] Frontend UI  -^> http://localhost:3000
start "SoloTensor - Frontend (:3000)" /d "%~dp0frontend" cmd /k "npm run dev"

echo.
echo =======================================================================
echo   Launched. Allow ~10s for both services to become ready.
echo.
echo   Web UI:      http://localhost:3000
echo   API docs:    http://127.0.0.1:8000/docs
echo.
echo   Close the two spawned windows to stop the services.
echo =======================================================================
echo.

timeout /t 3 /nobreak >nul
start http://localhost:3000
