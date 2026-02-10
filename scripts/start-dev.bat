@echo off
echo Starting ShiftSync in DEVELOPMENT Mode...

:: Start Backend (API)
echo Starting Backend (API)...
start "ShiftSync Backend" cmd /k "cd ../server && npm run dev"

:: Wait a moment for server to initialize
timeout /t 3 /nobreak >nul

:: Start Frontend (Vite)
echo Starting Frontend (Dev Server)...
start "ShiftSync Frontend" cmd /k "cd .. && npm run dev"

echo.
echo Development Environment Started!
echo Backend API: http://localhost:3001
echo Frontend UI: http://localhost:5173
echo.
pause
