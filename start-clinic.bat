@echo off
title Gawaran Maternal Clinic
cd /d "%~dp0"

echo.
echo  Gawaran Maternal Clinic - Starting server...
echo.

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
)

echo.
echo  Open in your browser:  http://localhost:3000
echo.
echo  Press Ctrl+C to stop the server.
echo.

npm start

pause
