@echo off
echo Starting AI Cybersecurity Platform...
echo.

echo Installing dependencies...
call npm install
cd client
call npm install
cd ..

echo.
echo Starting backend server...
start "Backend Server" cmd /k "npm run dev"

echo.
echo Starting frontend application...
timeout /t 3 >nul
cd client
start "Frontend Application" cmd /k "npm start"

echo.
echo Application is starting...
echo Backend: http://localhost:3000
echo Frontend: http://localhost:3001
echo.
echo Default login credentials:
echo Admin: admin@cybersec.com / admin123
echo Auditor: auditor@cybersec.com / auditor123
echo Auditee: auditee@cybersec.com / auditee123
echo.
pause
