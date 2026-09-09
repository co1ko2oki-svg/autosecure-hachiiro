@echo off
chcp 65001 >nul
title AutoSecure System Manager
color 0b

:MENU
cls
echo ======================================================================
echo                 AUTOSECURE SYSTEM MANAGER (BOT + WEB)
echo ======================================================================
echo.
echo  [1] Chay TAT CA (Bot + Backend + Frontend) trong 1 man hinh
echo  [2] Chay TAT CA trong 3 cua so CMD rieng biet
echo  [3] Chi chay Discord Bot (autosecure.js)
echo  [4] Chi chay Backend API (servers/backendServer.js - Port 5000)
echo  [5] Chi chay Frontend Web (servers/frontendServer.js - Port 3000)
echo  [6] Chay ngam PM2 (pm2 start ecosystem.config.js)
echo  [7] Xem log PM2 (pm2 logs)
echo  [8] Dung PM2 (pm2 stop all)
echo  [0] Thoat
echo.
echo ======================================================================
set /p choice="Nhap lua chon [0-8]: "

if "%choice%"=="1" goto RUN_ALL_ONE
if "%choice%"=="2" goto RUN_ALL_SEPARATE
if "%choice%"=="3" goto RUN_BOT
if "%choice%"=="4" goto RUN_BACKEND
if "%choice%"=="5" goto RUN_FRONTEND
if "%choice%"=="6" goto PM2_START
if "%choice%"=="7" goto PM2_LOGS
if "%choice%"=="8" goto PM2_STOP
if "%choice%"=="0" exit /b
goto MENU

:RUN_ALL_ONE
cls
node --no-deprecation run-all.js
pause
goto MENU

:RUN_ALL_SEPARATE
cls
start "Discord Bot" cmd /k "node --no-deprecation autosecure.js"
start "Backend API (5000)" cmd /k "node --no-deprecation servers/backendServer.js"
start "Frontend Web (3000)" cmd /k "node --no-deprecation servers/frontendServer.js"
pause
goto MENU

:RUN_BOT
cls
node --no-deprecation autosecure.js
pause
goto MENU

:RUN_BACKEND
cls
node --no-deprecation servers/backendServer.js
pause
goto MENU

:RUN_FRONTEND
cls
node --no-deprecation servers/frontendServer.js
pause
goto MENU

:PM2_START
cls
npx pm2 start ecosystem.config.js
npx pm2 status
pause
goto MENU

:PM2_LOGS
cls
npx pm2 logs
goto MENU

:PM2_STOP
cls
npx pm2 stop all
pause
goto MENU
