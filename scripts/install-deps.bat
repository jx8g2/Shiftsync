@echo off
echo Installing dependencies...

echo.
echo 1. Installing Root Dependencies (Frontend)...
cd ..
call npm install

echo.
echo 2. Installing Server Dependencies (Backend)...
cd server
call npm install

echo.
echo All dependencies installed!
pause
