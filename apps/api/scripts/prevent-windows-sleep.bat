@echo off
TITLE Preventing Windows Sleep for Bakery POS Server
echo ========================================================
echo   Configuring Power Plan: Prevent Sleep Mode
echo ========================================================
echo.

echo Setting Windows System Sleep timeout to NEVER (when plugged in)...
powercfg /change standby-timeout-ac 0

echo Setting Windows Disk Sleep timeout to NEVER...
powercfg /change disk-timeout-ac 0

echo.
echo ========================================================
echo SUCCESS!
echo - Computer 1 will stay AWAKE during shop hours.
echo - The display monitor can still turn off automatically,
echo   but the backend server will NEVER go to sleep!
echo ========================================================
echo.
pause
