@echo off
title Solo Studio Stopper
color 0C

echo =======================================================================
echo                     Stopping Solo Studio Services
echo =======================================================================
echo.

echo Stopping services on ports 3000, 8000, 8188...

for %%P in (3000 8000 8188) do (
    for /f "tokens=5" %%a in ('netstat -ano -p tcp ^| findstr ":%%P" ^| findstr "LISTENING"') do (
        echo Killing process %%a on port %%P...
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo.
echo =======================================================================
echo  Solo Studio services stopped.
echo =======================================================================
pause
