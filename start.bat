@echo off
title Solo Studio Launcher
color 0A

echo =======================================================================
echo                     Starting Solo Studio
echo =======================================================================
echo.
echo Services:
echo   [1/4] Local LLM (:8085)   - Qwen2.5-Coder-3B Director Engine
echo   [2/4] ComfyUI   (:8188)   - Image / Media Generation Engine
echo   [3/4] Backend   (:8000)   - FastAPI Studio REST & WebSocket API
echo   [4/4] Frontend  (:3000)   - Next.js 15 Creative Workspace
echo.
echo =======================================================================
echo.

echo [1/4] Starting Local LLM Engine on port 8085...
start "Solo Studio [1/4] - Local LLM (:8085)" cmd /k "call "%~dp0start-llm.bat""

ping -n 3 127.0.0.1 >nul

echo [2/4] Starting ComfyUI Engine on port 8188...
start "Solo Studio [2/4] - ComfyUI (:8188)" cmd /k "call "%~dp0start-comfy.bat""

ping -n 3 127.0.0.1 >nul

echo [3/4] Starting FastAPI Backend on port 8000...
start "Solo Studio [3/4] - Backend (:8000)" cmd /k "call "%~dp0start-be.bat""

ping -n 3 127.0.0.1 >nul

echo [4/4] Starting Next.js Frontend on port 3000...
start "Solo Studio [4/4] - Frontend (:3000)" cmd /k "call "%~dp0start-fe.bat""

echo.
echo =======================================================================
echo  All services have been launched in separate windows!
echo.
echo  - Frontend Web UI:  http://localhost:3000
echo  - API Swagger Docs: http://localhost:8000/docs
echo  - ComfyUI API:      http://127.0.0.1:8188
echo  - Local LLM API:    http://127.0.0.1:8085/v1
echo.
echo  Tip: To stop all services, run stop.bat
echo =======================================================================
echo.
echo Opening browser to http://localhost:3000 in 3 seconds...
ping -n 4 127.0.0.1 >nul
start http://localhost:3000
