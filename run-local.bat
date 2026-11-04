@echo off
setlocal
title SoloTensor - Local Dev

rem Only the API and UI are started here. Start ComfyUI separately for rendering.
cd /d "%~dp0"

if not exist "backend\app\main.py" goto missing_project
if not exist "frontend\package.json" goto missing_project
set "PY=%~dp0backend\.venv\Scripts\python.exe"
if not exist "%PY%" (
    echo [ERROR] Missing backend\.venv. Create it and install backend\requirements.txt first.
    exit /b 1
)
where node.exe >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is missing from PATH. Install Node.js and reopen this terminal.
    exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm is missing from PATH. Install Node.js and reopen this terminal.
    exit /b 1
)
where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Windows PowerShell is required for readiness checks.
    exit /b 1
)
rem Check both dependency sets before spawning either service. Never install silently.
if not exist "frontend\node_modules\.bin\next.cmd" (
    echo [ERROR] Frontend dependencies missing. Run npm ci from frontend, then retry.
    exit /b 1
)
"%PY%" -c "import uvicorn" >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Backend dependencies missing. Install backend\requirements.txt into backend\.venv, then retry.
    exit /b 1
)

set "PYTHONPATH=%~dp0backend"
echo [1/2] Starting backend at http://127.0.0.1:8000
start "SoloTensor - Backend (:8000)" /d "%~dp0backend" cmd /d /k ""%PY%" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
set "READY_URL=http://127.0.0.1:8000/api/v1/ready"
set "READY_KIND=backend"
call :wait_ready
if errorlevel 1 goto failed

echo [2/2] Starting frontend at http://127.0.0.1:3000
start "SoloTensor - Frontend (:3000)" /d "%~dp0frontend" cmd /d /k "npm run dev -- --hostname 127.0.0.1 --port 3000"
set "READY_URL=http://127.0.0.1:3000/"
set "READY_KIND=frontend"
call :wait_ready
if errorlevel 1 goto failed

echo [READY] Studio: http://127.0.0.1:3000/generate
echo         API docs: http://127.0.0.1:8000/docs
echo         Close the two service windows to stop. ComfyUI is not started here.
start "" "http://127.0.0.1:3000/generate"
exit /b 0

:wait_ready
rem At most 60 attempts, each with a 2-second HTTP timeout and 1-second retry delay.
rem Environment variables avoid interpolating URLs or JSON into nested cmd quotes.
powershell.exe -NoProfile -NonInteractive -Command "$ProgressPreference='SilentlyContinue'; for ($i=0; $i -lt 60; $i++) { try { $r=Invoke-WebRequest -UseBasicParsing -Uri $env:READY_URL -TimeoutSec 2; if ($r.StatusCode -eq 200) { if ($env:READY_KIND -ne 'backend' -or ($r.Content | ConvertFrom-Json).status -eq 'ready') { exit 0 } } } catch {}; if ($i -lt 59) { Start-Sleep -Seconds 1 } }; exit 1"
exit /b %errorlevel%

:missing_project
echo [ERROR] Backend or frontend project files missing. Keep run-local.bat in the repository root.
exit /b 1

:failed
echo [ERROR] %READY_KIND% did not become ready at %READY_URL%.
echo         Inspect its service window for errors. Check dependencies, backend .env, DB and storage access.
echo         Check ports 8000 and 3000 for existing services. Close spawned windows before retrying.
echo         ComfyUI is not required for API readiness. No browser was opened.
exit /b 1
