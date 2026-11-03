@echo off
title SmartGoNext POS - Fast Update System
color 0A
echo ====================================================
echo      SmartGoNext POS - Fast Update System
echo ====================================================
echo.

echo [Step 1/2] Pulling latest updates from Git...
git pull
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Git pull failed! Please check your internet connection or git branch.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [Step 2/2] Updating web client bundle...
call npm run build:client
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Web build failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ====================================================
echo   SUCCESS! All updates applied successfully.
echo   You can now launch the POS app.
echo ====================================================
pause

