@echo off
title Spectator Hotkeys
echo.
echo  Run this on the PC where you spectate the game (it can be on another VLAN).
echo  Type the address of the vMix PC that runs start-server.bat (the server window shows it),
echo  for example  10.20.0.15:8080
echo.
set /p SRV=vMix PC address:
set /p GAME=Game (cod or fc):
set /p PIN=Access code (press Enter if none):
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0spectator-hotkeys.ps1" -Server http://%SRV% -Game %GAME% -Pin "%PIN%"
pause
