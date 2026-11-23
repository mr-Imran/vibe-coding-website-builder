@echo off
rem Double-click this file on Windows to start the app.
rem Leave the window open while you use the app; close it to stop the app.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS installer from https://nodejs.org and run this again.
  pause
  exit /b 1
)
echo Starting. Open http://localhost:3000 in your browser.
node server.js
pause
