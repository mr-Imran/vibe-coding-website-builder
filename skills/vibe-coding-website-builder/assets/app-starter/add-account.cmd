@echo off
rem Double-click this file on Windows to create an account: the first
rem administrator, or anyone else later. It asks a few questions.
rem Press Enter at the password question to have one made up and shown once.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS installer from https://nodejs.org and run this again.
  pause
  exit /b 1
)
node tools\add-user.js
echo.
pause
