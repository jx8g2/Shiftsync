@echo off
echo Starting PostgreSQL Database via Docker...
docker-compose up -d
if %errorlevel% neq 0 (
    echo Failed to start Docker container. Ensure Docker Desktop is running.
    pause
    exit /b
)
echo Database started successfully!
pause
