@echo off
echo Starting InferenceLog System Locally...

:: Set working directory
set ROOT=%~dp0

:: 1. Ingestion Service
start cmd /k "cd %ROOT%ingestion && title Ingestion && node src/index.js"

:: 2. Backend API
start cmd /k "cd %ROOT%backend && title Backend && node src/index.js"

:: 3. Frontend
start cmd /k "cd %ROOT%frontend && title Frontend && npm.cmd run dev"

echo Services are starting in separate windows...
echo Frontend: http://localhost:5173
echo Backend: http://localhost:3000
echo Ingestion: http://localhost:3001
