@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22.19 ou superior: https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\ffmpeg-static\ffmpeg.exe (
  set NODE_OPTIONS=--use-system-ca
  call npm.cmd ci --no-audit --no-fund --cache .ixpotifai\npm-cache
  if errorlevel 1 (pause & exit /b 1)
)
set IXPOTIFAI_OPEN=1
node --use-system-ca scripts/run.mjs
pause
