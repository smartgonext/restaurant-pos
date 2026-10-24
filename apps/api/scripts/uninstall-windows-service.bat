@echo off
TITLE Removing Restaurant SaaS Background Service
echo ========================================================
echo   Removing Restaurant SaaS Auto-Start Service
echo ========================================================
echo.

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set VBS_LAUNCHER=%STARTUP_DIR%\RestaurantPOS_Backend.vbs

if exist "%VBS_LAUNCHER%" (
  del /f /q "%VBS_LAUNCHER%"
  echo Removed auto-start shortcut from Windows Startup.
) else (
  echo Auto-start shortcut was not found.
)

echo.
echo ========================================================
echo SUCCESS! Auto-Start Background Service Removed.
echo ========================================================
echo.
pause
