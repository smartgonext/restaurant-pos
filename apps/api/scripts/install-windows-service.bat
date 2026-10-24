@echo off
TITLE Installing Restaurant SaaS Background Service
echo ========================================================
echo   Installing Restaurant SaaS Auto-Start Service
echo ========================================================
echo.

set TARGET_DIR=%~dp0..
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set VBS_LAUNCHER=%STARTUP_DIR%\RestaurantPOS_Backend.vbs

echo Creating VBS script for silent background execution...
(
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.CurrentDirectory = "%TARGET_DIR%"
  echo WshShell.Run "node src/server.js", 0, False
) > "%VBS_LAUNCHER%"

echo.
echo ========================================================
echo SUCCESS! Auto-Start Background Service Installed.
echo.
echo - Shortcut location: %VBS_LAUNCHER%
echo - The backend server will now start SILENTLY in background
echo   whenever this computer turns on or reboots!
echo ========================================================
echo.
pause
