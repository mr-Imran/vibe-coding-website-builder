@echo off
rem Double-click this file on Windows to fill the app with made-up example
rem data and one account for each kind of user. It shows their passwords once.
rem It only works once; to start again, delete the "data" folder first.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS installer from https://nodejs.org and run this again.
  pause
  exit /b 1
)
node tools\seed.js
echo.
pause
