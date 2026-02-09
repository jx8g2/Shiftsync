@echo off
echo Starting ShiftSync in PRODUCTION Mode...

echo.
echo 1. Building frontend...
call npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b
)

echo.
echo 2. Starting Backend Server (API + Frontend)...
echo Serving on http://localhost:3001
echo.
cd server
npm start
pause
