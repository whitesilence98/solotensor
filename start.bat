@echo off
title Solo Studio Launcher
color 0A

echo =======================================================================
echo                     Starting Solo Studio
echo =======================================================================
echo.
echo [1/3] Starting ComfyUI Engine on port 8188...
if exist "D:\ComfyUI-master\venv\Scripts\activate.bat" (
    start "Solo Studio [1/3] - ComfyUI (:8188)" cmd /k "title ComfyUI (:8188) && cd /d D:\ComfyUI-master && call .\venv\Scripts\activate.bat && python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch"
) else (
    start "Solo Studio [1/3] - ComfyUI (:8188)" cmd /k "title ComfyUI (:8188) && cd /d D:\ComfyUI-master && python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch"
)

ping -n 3 127.0.0.1 >nul

echo [2/3] Starting Solo Studio FastAPI Backend on port 8000...
start "Solo Studio [2/3] - Backend (:8000)" cmd /k "title Solo Studio Backend (:8000) && cd /d %~dp0backend && uvicorn app.main:app --reload --port 8000"

ping -n 3 127.0.0.1 >nul

echo [3/3] Starting Solo Studio Next.js Frontend on port 3000...
start "Solo Studio [3/3] - Frontend (:3000)" cmd /k "title Solo Studio Frontend (:3000) && cd /d %~dp0frontend && npm run dev"

echo.
echo =======================================================================
echo  All services have been launched in separate windows!
echo  - Frontend Web UI:  http://localhost:3000
echo  - API Swagger Docs: http://localhost:8000/docs
echo  - ComfyUI API:      http://127.0.0.1:8188
echo =======================================================================
echo.
echo Opening browser to http://localhost:3000 in 3 seconds...
ping -n 4 127.0.0.1 >nul
start http://localhost:3000
