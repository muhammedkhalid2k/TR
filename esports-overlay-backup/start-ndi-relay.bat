@echo off
title NDI Relay
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ndi-relay.ps1"
pause
