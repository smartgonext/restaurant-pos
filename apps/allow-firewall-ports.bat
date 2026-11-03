@echo off
:: Batch script to allow Restaurant POS Server through Windows Firewall
echo ====================================================
echo  Opening Windows Firewall for Restaurant POS
echo ====================================================

net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERROR] Please right-click this file and select "Run as administrator".
    pause
    exit /b 1
)

echo Adding inbound rule for Port 3001 (Web POS Server)...
netsh advfirewall firewall delete rule name="Restaurant POS Server (3001)" >nul 2>&1
netsh advfirewall firewall add rule name="Restaurant POS Server (3001)" dir=in action=allow protocol=TCP localport=3001 profile=any

echo Adding inbound rule for Port 3002 (LAN Discovery UDP)...
netsh advfirewall firewall delete rule name="Restaurant POS Discovery (3002)" >nul 2>&1
netsh advfirewall firewall add rule name="Restaurant POS Discovery (3002)" dir=in action=allow protocol=UDP localport=3002 profile=any

echo.
echo ====================================================
echo  SUCCESS! Ports 3001 and 3002 are now OPEN in Firewall.
echo  Other computers on your LAN can now connect to:
echo  http://YOUR_LOCAL_IP:3001
echo ====================================================
pause

