@echo off
title Solo Studio - Frontend (:3000)
color 0E

echo =======================================================================
echo              Solo Studio - Next.js Frontend (Port 3000)
echo =======================================================================
echo.

cd /d "%~dp0frontend"

if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b %ERRORLEVEL%
    )
)

echo Starting Next.js development server on http://localhost:3000...
echo.

call npm run dev

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Next.js frontend exited with code %ERRORLEVEL%.
    pause
)
