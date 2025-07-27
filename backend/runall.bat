@echo off
REM Go up one directory and then into frontend
cd frontend

REM Build the frontend script using Bun
bun build script-i.js --outfile script-o.js

REM Go back up and into backend
cd ..
cd backend

REM Start FastAPI server with uvicorn
uvicorn physics:app --reload

pause
