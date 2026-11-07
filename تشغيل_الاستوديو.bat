@echo off
chcp 65001 >nul
title AI Editor - استوديو الريلز
echo ====================================================
echo   تشغيل استوديو الريلز
echo   سيتم فتح المتصفح على:
echo   http://localhost:3000
echo ====================================================
start "" "http://localhost:3000"
npm run dev
pause
