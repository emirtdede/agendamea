@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Agendamea - Yapilacaklar Uygulamasi
cd /d "%~dp0.."

echo.
echo  =============================================
echo   Agendamea baslatiliyor...
echo  =============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  [HATA] Node.js bulunamadi. Lutfen https://nodejs.org adresinden Node.js LTS kurun.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  Gerekli paketler kuruluyor, lutfen bekleyin...
  call npm install
  if errorlevel 1 (
    echo  [HATA] Paket kurulumu basarisiz oldu.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo  Uretim derlemesi hazirlaniyor...
  call npm run build
  if errorlevel 1 (
    echo  [HATA] Derleme basarisiz oldu.
    pause
    exit /b 1
  )
) else if not exist "dist-server\server.mjs" (
  echo  Sunucu derlemesi hazirlaniyor...
  call npm run build:server
  if errorlevel 1 (
    echo  [HATA] Sunucu derlemesi basarisiz oldu.
    pause
    exit /b 1
  )
)

set "NODE_ENV=production"
set "PORT=3000"

rem Microsoft Edge uygulama penceresi varsa yerel pencere modunda ac, yoksa varsayilan tarayiciyi ac
set "EDGE_PATH="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if defined EDGE_PATH (
  start "" "!EDGE_PATH!" --app=http://localhost:3000 --window-size=1280,820
) else (
  start "" http://localhost:3000
)

node dist-server\server.mjs
pause
