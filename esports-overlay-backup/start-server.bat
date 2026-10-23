@echo off
title Tournament Overlays Server
cd /d "%~dp0"
start "NDI Relay" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ndi-relay.ps1"
start "" "http://localhost:8080/control.html"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
