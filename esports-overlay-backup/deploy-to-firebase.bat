@echo off
title Deploy Esports Overlay to Firebase Hosting
cd /d "%~dp0"
echo.
echo  Publishes this folder (demo + asset exporter) to Firebase Hosting.
echo  Your saved data (data\state.json, logos you uploaded) is NOT uploaded.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is needed once for the Firebase tools. Install the LTS version from https://nodejs.org
  echo  then run this file again.
  echo.
  pause
  exit /b
)
echo  1) Create a project at https://console.firebase.google.com  (name it: Esports Overlay)
echo     Firebase gives it an ID such as  esports-overlay  - type that ID below.
echo.
set /p PROJ=Firebase project ID:
echo.
echo  2) A browser window opens to sign in to your Google account...
call npx --yes firebase-tools@latest login
echo.
echo  3) Uploading...
call npx --yes firebase-tools@latest deploy --only hosting --project %PROJ%
echo.
echo  Your site: https://%PROJ%.web.app
pause
