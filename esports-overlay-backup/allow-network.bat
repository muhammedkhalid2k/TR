@echo off
title Allow network access for the overlay server
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Please right-click this file and choose "Run as administrator".
  echo.
  pause
  exit /b
)
echo Allowing other PCs (also on other VLANs) to reach the overlay server (8080) and the NDI relay (8089-8092) ...
netsh http add urlacl url=http://+:8080/ user=Everyone
netsh http add urlacl url=http://+:8089/ user=Everyone
netsh http add urlacl url=http://+:8090/ user=Everyone
netsh http add urlacl url=http://+:8091/ user=Everyone
netsh http add urlacl url=http://+:8092/ user=Everyone
netsh advfirewall firewall add rule name="Tournament Overlays 8080" dir=in action=allow protocol=TCP localport=8080
netsh advfirewall firewall add rule name="Tournament Overlays NDI relay 8089-8092" dir=in action=allow protocol=TCP localport=8089-8092
echo.
echo Done. Now restart start-server.bat - it will say "Network access: ON".
pause
