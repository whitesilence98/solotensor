@echo off
title Solo Studio - Backend (:8000)
color 0A

echo =======================================================================
echo              Solo Studio - FastAPI Backend (Port 8000)
echo =======================================================================
echo.

cd /d "%~dp0backend"

set "PYTHONPATH=%~dp0backend"

if exist "%~dp0backend\.venv\Scripts\activate.bat" (
    echo [INFO] Activating virtual environment in backend\.venv...
    call "%~dp0backend\.venv\Scripts\activate.bat"
    python -m uvicorn app.main:app --reload --port 8000
) else (
    echo [INFO] Using system python for uvicorn...
    python -m uvicorn app.main:app --reload --port 8000
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Backend server exited with code %ERRORLEVEL%.
    pause
)
